import { NextRequest, NextResponse } from 'next/server';

const DRIVE_FOLDER_NAME = 'ASDRI Work Submissions';
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  webContentLink?: string;
  createdTime?: string;
  description?: string;
}

async function ensureSubmissionFolder(authHeader: string): Promise<DriveFileMeta> {
  const query = `name = '${DRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query
  )}&fields=${encodeURIComponent('files(id,name,mimeType,webViewLink)')}&pageSize=5`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: authHeader },
    cache: 'no-store',
  });

  if (!searchRes.ok) {
    const errBody = await searchRes.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || 'Google Drive ফোল্ডার যাচাই করা যায়নি।');
  }

  const searchData = (await searchRes.json()) as { files?: DriveFileMeta[] };
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0];
  }

  const createRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?fields=${encodeURIComponent(
      'id,name,mimeType,webViewLink'
    )}`,
    {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: DRIVE_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    }
  );

  if (!createRes.ok) {
    const errBody = await createRes.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || 'Google Drive ফোল্ডার তৈরি করা যায়নি।');
  }

  return (await createRes.json()) as DriveFileMeta;
}

async function uploadMultipartToDrive(params: {
  authHeader: string;
  folderId: string;
  fileName: string;
  mimeType: string;
  description: string;
  bytes: Uint8Array;
}): Promise<DriveFileMeta> {
  const boundary = `asdri_drive_boundary_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const metadataPart = JSON.stringify({
    name: params.fileName,
    parents: [params.folderId],
    description: params.description,
  });

  const encoder = new TextEncoder();
  const preamble = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataPart}\r\n--${boundary}\r\nContent-Type: ${
      params.mimeType || 'application/octet-stream'
    }\r\n\r\n`
  );
  const epilogue = encoder.encode(`\r\n--${boundary}--`);

  const bodyBytes = new Uint8Array(preamble.length + params.bytes.length + epilogue.length);
  bodyBytes.set(preamble, 0);
  bodyBytes.set(params.bytes, preamble.length);
  bodyBytes.set(epilogue, preamble.length + params.bytes.length);

  const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${encodeURIComponent(
    'id,name,mimeType,size,webViewLink,webContentLink,createdTime'
  )}`;

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: params.authHeader,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: bodyBytes,
  });

  if (!uploadRes.ok) {
    const errBody = await uploadRes.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || 'Google Drive ফাইল আপলোড ব্যর্থ হয়েছে।');
  }

  return (await uploadRes.json()) as DriveFileMeta;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { ok: false, message: 'Google Drive সংযোগ টোকেন পাওয়া যায়নি। অনুগ্রহ করে পুনরায় Sign in করুন।' },
      { status: 401 }
    );
  }

  try {
    const folder = await ensureSubmissionFolder(authHeader);
    const q = `'${folder.id}' in parents and trashed = false`;
    const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      q
    )}&fields=${encodeURIComponent(
      'files(id,name,mimeType,size,webViewLink,webContentLink,createdTime,description)'
    )}&orderBy=createdTime desc&pageSize=50`;

    const listRes = await fetch(listUrl, {
      headers: { Authorization: authHeader },
      cache: 'no-store',
    });

    if (!listRes.ok) {
      const errBody = await listRes.json().catch(() => ({}));
      return NextResponse.json(
        { ok: false, message: errBody?.error?.message || 'ফাইল তালিকা লোড করা যায়নি।' },
        { status: listRes.status }
      );
    }

    const listData = (await listRes.json()) as { files?: DriveFileMeta[] };
    return NextResponse.json({
      ok: true,
      folderId: folder.id,
      folderName: DRIVE_FOLDER_NAME,
      folderUrl:
        folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
      files: listData.files || [],
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message : 'Google Drive সার্ভারে সমস্যা হয়েছে।',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { ok: false, message: 'Google Drive-এ আপলোড করতে অনুগ্রহ করে আগে Google দিয়ে Sign in করুন।' },
      { status: 401 }
    );
  }

  try {
    const contentType = req.headers.get('content-type') || '';

    // Mode 1: Institutional Backup JSON Snapshot to Google Drive
    if (contentType.includes('application/json')) {
      const payload = (await req.json()) as {
        action?: string;
        fileName?: string;
        data?: unknown;
      };
      if (payload.action !== 'backup' || !payload.data) {
        return NextResponse.json(
          { ok: false, message: 'সঠিক ব্যাকআপ ডেটা প্রদান করা হয়নি।' },
          { status: 400 }
        );
      }

      const folder = await ensureSubmissionFolder(authHeader);
      const safeFileName = (
        payload.fileName || `ASDRI_Backup_${new Date().toISOString().slice(0, 10)}.json`
      ).replace(/[^a-zA-Z0-9._\-]/g, '_');

      const jsonBytes = new TextEncoder().encode(JSON.stringify(payload.data, null, 2));
      const uploaded = await uploadMultipartToDrive({
        authHeader,
        folderId: folder.id,
        fileName: safeFileName,
        mimeType: 'application/json',
        description: 'ASDRI Portal Institutional Backup Snapshot',
        bytes: jsonBytes,
      });

      return NextResponse.json({
        ok: true,
        file: uploaded,
      });
    }

    // Mode 2: Multipart Work Submission File Upload
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, message: 'কোনো বৈধ ফাইল নির্বাচন করা হয়নি।' },
        { status: 400 }
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { ok: false, message: 'ফাইলের আকার সর্বোচ্চ ২৫ MB-এর মধ্যে হতে হবে।' },
        { status: 400 }
      );
    }

    const taskSerial = String(formData.get('taskSerial') || 'Task');
    const employeeId = String(formData.get('employeeId') || 'STAFF');
    const employeeName = String(formData.get('employeeName') || 'Member');

    const folder = await ensureSubmissionFolder(authHeader);
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const prefixedFileName = `[Task-${taskSerial}][${employeeId}] ${file.name}`;
    const uploaded = await uploadMultipartToDrive({
      authHeader,
      folderId: folder.id,
      fileName: prefixedFileName,
      mimeType: file.type || 'application/octet-stream',
      description: `Submitted by ${employeeName} (${employeeId}) for Task #${taskSerial}`,
      bytes,
    });

    const attachment = {
      id: `GD-${uploaded.id}`,
      fileName: file.name,
      fileSize: file.size,
      mimeType: uploaded.mimeType || file.type || 'application/octet-stream',
      webUrl:
        uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
      downloadUrl: uploaded.webContentLink || undefined,
      driveFileId: uploaded.id,
      storageProvider: 'google_drive' as const,
      uploadedAt: uploaded.createdTime || new Date().toISOString(),
      uploadedBy: employeeName,
    };

    return NextResponse.json({
      ok: true,
      attachment,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message:
          err instanceof Error ? err.message : 'Google Drive ফাইল আপলোডে সমস্যা হয়েছে।',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { ok: false, message: 'অনুমোদিত Google Drive টোকেন পাওয়া যায়নি।' },
      { status: 401 }
    );
  }

  const fileId = req.nextUrl.searchParams.get('fileId') || '';
  if (!/^[a-zA-Z0-9_\-]+$/.test(fileId)) {
    return NextResponse.json(
      { ok: false, message: 'সঠিক ফাইল আইডি প্রদান করা হয়নি।' },
      { status: 400 }
    );
  }

  try {
    const delRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: authHeader },
      }
    );

    if (!delRes.ok && delRes.status !== 404) {
      const errBody = await delRes.json().catch(() => ({}));
      return NextResponse.json(
        { ok: false, message: errBody?.error?.message || 'Google Drive থেকে ফাইল মুছা যায়নি।' },
        { status: delRes.status }
      );
    }

    return NextResponse.json({ ok: true, deletedFileId: fileId });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message : 'Google Drive ফাইল মুছতে সমস্যা হয়েছে।',
      },
      { status: 500 }
    );
  }
}
