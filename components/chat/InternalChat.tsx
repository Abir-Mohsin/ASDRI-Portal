'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  MessageSquare,
  Plus,
  Reply,
  Search,
  Send,
  Settings2,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { ChatConversation, ChatMessage, Employee, getRoleLabel, isAdministrativeRole } from '@/lib/types';

function formatMessageTime(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('bn-BD', {
      timeZone: 'Asia/Dhaka',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return '';
  }
}

function getDateKey(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return '';
  }
}

function formatMessageDateLabel(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const msgKey = getDateKey(iso);
    const now = new Date();
    const todayKey = getDateKey(now.toISOString());
    const yesterdayKey = getDateKey(new Date(now.getTime() - 86400000).toISOString());
    const formatted = new Intl.DateTimeFormat('bn-BD', {
      timeZone: 'Asia/Dhaka',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
    if (msgKey && msgKey === todayKey) return `আজ · ${formatted}`;
    if (msgKey && msgKey === yesterdayKey) return `গতকাল · ${formatted}`;
    return formatted;
  } catch {
    return '';
  }
}

export function InternalChat() {
  const {
    currentUser,
    employees,
    chatConversations,
    chatMessages,
    activeChatConversationId,
    setActiveChatConversationId,
    getConversationUnreadCount,
    startDirectChat,
    createGroupChat,
    updateGroupChatMembers,
    deleteGroupChat,
    sendChatMessage,
    markConversationAsRead,
  } = useApp();

  const [filterTab, setFilterTab] = useState<'all' | 'direct' | 'group' | 'directory'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [mobileShowThread, setMobileShowThread] = useState(false);

  // Create Group Modal State
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupDepartment, setGroupDepartment] = useState('');
  const [groupSelectedIds, setGroupSelectedIds] = useState<string[]>([]);
  const [groupMemberSearch, setGroupMemberSearch] = useState('');

  // Manage Group Members Modal State
  const [showManageGroup, setShowManageGroup] = useState(false);
  const [editGroupTitle, setEditGroupTitle] = useState('');
  const [editGroupMemberIds, setEditGroupMemberIds] = useState<string[]>([]);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.status === 'Active'),
    [employees]
  );

  const employeeMap = useMemo(() => {
    const m = new Map<string, Employee>();
    employees.forEach((e) => m.set(e.id, e));
    return m;
  }, [employees]);

  const getConversationDisplay = useCallback(
    (conv: ChatConversation) => {
      if (conv.type === 'direct') {
        const otherId =
          conv.participantEmployeeIds.find((id) => id !== currentUser.id) || currentUser.id;
        const other = employeeMap.get(otherId);
        return {
          name: other ? other.nameBn || other.name : conv.title,
          subtitle: other
            ? `${other.designationBn || other.designation} · ${other.department}`
            : 'ব্যক্তিগত চ্যাট',
          photoUrl: other?.photoUrl || '',
          initials: (other?.nameBn || other?.name || conv.title || 'স').slice(0, 1),
        };
      }
      return {
        name: conv.title,
        subtitle: conv.department
          ? `${conv.department} · ${conv.participantEmployeeIds.length} জন সদস্য`
          : `${conv.participantEmployeeIds.length} জন সদস্য`,
        photoUrl: '',
        initials: (conv.title || 'গ').slice(0, 1),
      };
    },
    [currentUser.id, employeeMap]
  );

  // Conversations accessible to the current user
  const myConversations = useMemo(() => {
    const accessible = chatConversations.filter((c) => {
      if (c.isDefaultGroup) return true;
      return c.participantEmployeeIds.includes(currentUser.id);
    });

    return accessible.sort((a, b) => {
      const aTime = a.lastMessageAt || a.updatedAt || a.createdAt || '';
      const bTime = b.lastMessageAt || b.updatedAt || b.createdAt || '';
      if (a.lastMessageAt && !b.lastMessageAt) return -1;
      if (!a.lastMessageAt && b.lastMessageAt) return 1;
      if (a.id === 'GRP-GENERAL' && !a.lastMessageAt && !b.lastMessageAt) return -1;
      if (b.id === 'GRP-GENERAL' && !a.lastMessageAt && !b.lastMessageAt) return 1;
      return bTime.localeCompare(aTime);
    });
  }, [chatConversations, currentUser.id]);

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return myConversations.filter((c) => {
      if (filterTab === 'direct' && c.type !== 'direct') return false;
      if (filterTab === 'group' && c.type !== 'group') return false;
      if (!q) return true;
      const disp = getConversationDisplay(c);
      return (
        disp.name.toLowerCase().includes(q) ||
        disp.subtitle.toLowerCase().includes(q) ||
        (c.lastMessageText || '').toLowerCase().includes(q)
      );
    });
  }, [myConversations, filterTab, searchQuery, getConversationDisplay]);

  const filteredColleagues = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeEmployees
      .filter((e) => e.id !== currentUser.id)
      .filter((e) => {
        if (!q) return true;
        return (
          (e.nameBn || '').toLowerCase().includes(q) ||
          (e.name || '').toLowerCase().includes(q) ||
          (e.department || '').toLowerCase().includes(q) ||
          (e.designationBn || '').toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q)
        );
      });
  }, [activeEmployees, currentUser.id, searchQuery]);

  // Select default conversation if none selected
  const activeConversation = useMemo(() => {
    if (activeChatConversationId) {
      const found = myConversations.find((c) => c.id === activeChatConversationId);
      if (found) return found;
    }
    return myConversations[0] || null;
  }, [activeChatConversationId, myConversations]);

  useEffect(() => {
    if (!activeChatConversationId && myConversations.length > 0) {
      setActiveChatConversationId(myConversations[0].id);
    }
  }, [activeChatConversationId, myConversations, setActiveChatConversationId]);

  const activeMessages = useMemo(() => {
    if (!activeConversation) return [];
    return chatMessages
      .filter((m) => m.conversationId === activeConversation.id)
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  }, [chatMessages, activeConversation]);

  const lastMessageByConvId = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const msg of chatMessages) {
      const existing = map.get(msg.conversationId);
      if (!existing || (msg.createdAt || '').localeCompare(existing.createdAt || '') >= 0) {
        map.set(msg.conversationId, msg);
      }
    }
    return map;
  }, [chatMessages]);

  const hasUnreadInActive = useMemo(() => {
    if (!activeConversation || !currentUser.id) return false;
    return activeMessages.some(
      (m) =>
        m.senderEmployeeId !== currentUser.id &&
        !(m.readByEmployeeIds || []).includes(currentUser.id)
    );
  }, [activeConversation, activeMessages, currentUser.id]);

  // Mark active conversation as read whenever opened or new unread messages arrive
  useEffect(() => {
    if (!activeConversation?.id || !hasUnreadInActive) return;
    const isDesktop = typeof window === 'undefined' ? true : window.innerWidth >= 768;
    if (isDesktop || mobileShowThread) {
      markConversationAsRead(activeConversation.id);
    }
  }, [activeConversation?.id, hasUnreadInActive, mobileShowThread, markConversationAsRead]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.id, activeMessages.length]);

  const handleJumpToMessage = (messageId?: string) => {
    if (!messageId) return;
    const el = document.getElementById(`chat-msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(messageId);
      window.setTimeout(() => {
        setHighlightedMsgId((prev) => (prev === messageId ? null : prev));
      }, 1800);
    }
  };

  const handleSelectConversation = (convId: string) => {
    setActiveChatConversationId(convId);
    setReplyTarget(null);
    setMobileShowThread(true);
    markConversationAsRead(convId);
  };

  const handleStartDirectWithColleague = (targetId: string) => {
    const convId = startDirectChat(targetId);
    if (convId) {
      setFilterTab('all');
      setReplyTarget(null);
      setMobileShowThread(true);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeConversation || !messageInput.trim()) return;
    sendChatMessage({
      conversationId: activeConversation.id,
      text: messageInput,
      replyToMessageId: replyTarget?.id,
      replyToSenderName: replyTarget?.senderName,
      replyToText: replyTarget?.text?.slice(0, 200),
    });
    setMessageInput('');
    setReplyTarget(null);
    inputRef.current?.focus();
  };

  const handleCreateGroupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupTitle.trim()) return;
    const newId = createGroupChat({
      title: groupTitle.trim(),
      department: groupDepartment.trim() || undefined,
      participantEmployeeIds: groupSelectedIds,
    });
    if (newId) {
      setShowCreateGroup(false);
      setGroupTitle('');
      setGroupDepartment('');
      setGroupSelectedIds([]);
      setGroupMemberSearch('');
      setFilterTab('all');
      setMobileShowThread(true);
    }
  };

  const openManageGroupModal = () => {
    if (!activeConversation || activeConversation.type !== 'group') return;
    setEditGroupTitle(activeConversation.title);
    setEditGroupMemberIds(activeConversation.participantEmployeeIds);
    setConfirmDeleteGroup(false);
    setShowManageGroup(true);
  };

  const handleSaveGroupMembers = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConversation || activeConversation.type !== 'group') return;
    updateGroupChatMembers(activeConversation.id, {
      title: activeConversation.isDefaultGroup ? activeConversation.title : editGroupTitle.trim(),
      participantEmployeeIds: editGroupMemberIds,
    });
    setShowManageGroup(false);
  };

  const handleDeleteCurrentGroup = () => {
    if (!activeConversation || activeConversation.isDefaultGroup) return;
    deleteGroupChat(activeConversation.id);
    setShowManageGroup(false);
    setConfirmDeleteGroup(false);
    setMobileShowThread(false);
  };

  const canManageActiveGroup =
    activeConversation?.type === 'group' &&
    (isAdministrativeRole(currentUser.role) ||
      activeConversation.createdByEmployeeId === currentUser.id);

  const activeDisp = activeConversation ? getConversationDisplay(activeConversation) : null;

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
            অভ্যন্তরীণ চ্যাট ও মেসেজিং
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            সহকর্মীদের সাথে ব্যক্তিগত (১-টু-১) অথবা বিভাগীয় ও কাস্টম গ্রুপে তাৎক্ষণিক বার্তা আদান-প্রদান
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setFilterTab('directory');
              setMobileShowThread(false);
            }}
            className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5 text-emerald-800" />
            <span>পার্সোনাল চ্যাট</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setGroupSelectedIds([currentUser.id].filter(Boolean));
              setShowCreateGroup(true);
            }}
            className="px-3.5 py-2 rounded-lg bg-[#0f4c3a] hover:bg-emerald-900 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>নতুন গ্রুপ</span>
          </button>
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden grid grid-cols-1 md:grid-cols-12 h-[calc(100vh-230px)] min-h-[540px]">
        {/* Left Sidebar: Conversations & Colleague Directory */}
        <aside
          className={`md:col-span-4 lg:col-span-4 border-r border-slate-200 flex flex-col min-h-0 bg-slate-50/40 ${
            mobileShowThread ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Search & Filter Tabs */}
          <div className="p-3 border-b border-slate-200 bg-white space-y-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="সহকর্মী বা গ্রুপ খুঁজুন..."
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-700 focus:outline-none text-xs text-slate-900"
              />
            </div>

            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'all', label: 'সব' },
                  { id: 'direct', label: 'পার্সোনাল' },
                  { id: 'group', label: 'গ্রুপ' },
                  { id: 'directory', label: 'সহকর্মী' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterTab(tab.id)}
                  className={`py-1.5 px-2 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    filterTab === tab.id
                      ? 'bg-white text-emerald-950 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* List Area */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filterTab === 'directory' ? (
              filteredColleagues.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  কোনো সহকর্মী পাওয়া যায়নি
                </div>
              ) : (
                filteredColleagues.map((emp) => (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => handleStartDirectWithColleague(emp.id)}
                    className="w-full px-3.5 py-3 flex items-center gap-3 hover:bg-emerald-50/50 transition-colors text-left cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-full bg-emerald-900 text-amber-300 font-bold text-xs flex items-center justify-center shrink-0 overflow-hidden border border-emerald-800/30">
                      {emp.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={emp.photoUrl}
                          alt={emp.nameBn || emp.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        (emp.nameBn || emp.name || 'স').slice(0, 1)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {emp.nameBn || emp.name}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {emp.designationBn || emp.designation} · {emp.department}
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-800 shrink-0">
                      মেসেজ
                    </span>
                  </button>
                ))
              )
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <MessageSquare className="w-7 h-7 text-slate-300 mx-auto" />
                <p className="text-xs text-slate-500">কোনো কথোপকথন পাওয়া যায়নি</p>
                <button
                  type="button"
                  onClick={() => setFilterTab('directory')}
                  className="text-xs font-bold text-emerald-800 hover:underline cursor-pointer"
                >
                  সহকর্মী নির্বাচন করে চ্যাট শুরু করুন
                </button>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const disp = getConversationDisplay(conv);
                const unread = getConversationUnreadCount(conv.id);
                const isSelected = activeConversation?.id === conv.id;
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => handleSelectConversation(conv.id)}
                    className={`w-full px-3.5 py-3 flex items-start gap-3 transition-colors text-left cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50/90'
                        : 'bg-white/60 hover:bg-slate-100/70'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold overflow-hidden ${
                        conv.type === 'group'
                          ? 'bg-emerald-950 text-amber-300'
                          : 'bg-slate-200 text-slate-800'
                      }`}
                    >
                      {disp.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={disp.photoUrl}
                          alt={disp.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : conv.type === 'group' ? (
                        <Users className="w-4 h-4" />
                      ) : (
                        disp.initials
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs truncate ${
                            unread > 0 || isSelected
                              ? 'font-bold text-slate-950'
                              : 'font-semibold text-slate-800'
                          }`}
                        >
                          {disp.name}
                        </span>
                        <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                          {formatMessageTime(conv.lastMessageAt)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        {(() => {
                          const lastMsg = lastMessageByConvId.get(conv.id);
                          const isLastMine = lastMsg && lastMsg.senderEmployeeId === currentUser.id;
                          const lastReadByOthers = lastMsg
                            ? (lastMsg.readByEmployeeIds || []).filter(
                                (id) => id && id !== lastMsg.senderEmployeeId
                              ).length > 0
                            : false;
                          return (
                            <p
                              className={`text-[11px] truncate flex items-center gap-1 min-w-0 ${
                                unread > 0 ? 'text-slate-800 font-semibold' : 'text-slate-500'
                              }`}
                            >
                              {isLastMine &&
                                (lastReadByOthers ? (
                                  <CheckCheck
                                    className="w-3.5 h-3.5 text-sky-600 shrink-0"
                                    strokeWidth={2.4}
                                    aria-label="পঠিত"
                                  />
                                ) : (
                                  <Check
                                    className="w-3.5 h-3.5 text-slate-400 shrink-0"
                                    strokeWidth={2.4}
                                    aria-label="প্রেরিত"
                                  />
                                ))}
                              <span className="truncate">
                                {conv.lastMessageText
                                  ? conv.type === 'group' && conv.lastMessageSenderName
                                    ? `${conv.lastMessageSenderName}: ${conv.lastMessageText}`
                                    : conv.lastMessageText
                                  : disp.subtitle}
                              </span>
                            </p>
                          );
                        })()}
                        {unread > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-slate-950 text-[10px] font-extrabold tabular-nums flex items-center justify-center shrink-0">
                            {unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Panel: Active Thread */}
        <section
          className={`md:col-span-8 lg:col-span-8 flex flex-col min-h-0 bg-white ${
            mobileShowThread ? 'flex' : 'hidden md:flex'
          }`}
        >
          {!activeConversation || !activeDisp ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-center">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">কথোপকথন নির্বাচন করুন</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  বামপাশের তালিকা থেকে যেকোনো সহকর্মী বা গ্রুপ নির্বাচন করুন অথবা নতুন গ্রুপ তৈরি করে আলোচনা শুরু করুন।
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3 bg-white shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setMobileShowThread(false)}
                    className="md:hidden p-1.5 -ml-1 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
                    aria-label="তালিকায় ফিরুন"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold overflow-hidden ${
                      activeConversation.type === 'group'
                        ? 'bg-emerald-950 text-amber-300'
                        : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    {activeDisp.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={activeDisp.photoUrl}
                        alt={activeDisp.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : activeConversation.type === 'group' ? (
                      <Users className="w-4 h-4" />
                    ) : (
                      <User className="w-4 h-4" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 truncate">
                      {activeDisp.name}
                    </h3>
                    <div className="text-[11px] text-slate-500 truncate">
                      {activeDisp.subtitle}
                    </div>
                  </div>
                </div>

                {activeConversation.type === 'group' && (
                  <button
                    type="button"
                    onClick={openManageGroupModal}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Settings2 className="w-3.5 h-3.5 text-emerald-800" />
                    <span className="hidden sm:inline">
                      {canManageActiveGroup ? 'সদস্য ও সেটিংস' : 'সদস্য তালিকা'}
                    </span>
                  </button>
                )}
              </div>

              {/* Message Stream */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50/60">
                {activeMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-10">
                    <p className="text-xs font-semibold text-slate-600">
                      এই চ্যাটে এখনো কোনো বার্তা পাঠানো হয়নি
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      নিচের বক্সে লিখে প্রথম বার্তা পাঠান
                    </p>
                  </div>
                ) : (
                  activeMessages.map((msg, idx) => {
                    const isMine = msg.senderEmployeeId === currentUser.id;
                    const currentDateKey = getDateKey(msg.createdAt);
                    const prevDateKey = idx > 0 ? getDateKey(activeMessages[idx - 1].createdAt) : '';
                    const showDateDivider =
                      idx === 0 || (Boolean(currentDateKey) && currentDateKey !== prevDateKey);
                    const readerIdsExceptSender = (msg.readByEmployeeIds || []).filter(
                      (id) => id && id !== msg.senderEmployeeId
                    );
                    const isReadByRecipient = readerIdsExceptSender.length > 0;
                    const readerNames = readerIdsExceptSender
                      .map((id) => {
                        const emp = employeeMap.get(id);
                        return emp ? emp.nameBn || emp.name : id;
                      })
                      .slice(0, 5)
                      .join(', ');
                    const isHighlighted = highlightedMsgId === msg.id;

                    return (
                      <React.Fragment key={msg.id}>
                        {showDateDivider && formatMessageDateLabel(msg.createdAt) && (
                          <div className="flex items-center gap-3 my-3">
                            <div className="flex-1 h-px bg-slate-200/90" />
                            <span className="px-3 py-0.5 rounded-md bg-white border border-slate-200 text-[11px] text-slate-600 font-semibold shadow-2xs">
                              {formatMessageDateLabel(msg.createdAt)}
                            </span>
                            <div className="flex-1 h-px bg-slate-200/90" />
                          </div>
                        )}

                        <div
                          id={`chat-msg-${msg.id}`}
                          className={`group flex flex-col transition-colors rounded-xl ${
                            isMine ? 'items-end' : 'items-start'
                          } ${isHighlighted ? 'bg-amber-100/70 p-1 -m-1' : ''}`}
                        >
                          {!isMine && activeConversation.type === 'group' && (
                            <div className="text-[11px] font-semibold text-slate-600 mb-1 px-1">
                              {msg.senderName}
                              {msg.senderRole && (
                                <span className="text-slate-400 font-normal">
                                  {' '}
                                  · {getRoleLabel(msg.senderRole, true)}
                                </span>
                              )}
                            </div>
                          )}

                          <div
                            className={`flex items-end gap-1.5 max-w-[90%] sm:max-w-[76%] ${
                              isMine ? 'flex-row-reverse' : 'flex-row'
                            }`}
                          >
                            <div
                              onDoubleClick={() => {
                                setReplyTarget(msg);
                                inputRef.current?.focus();
                              }}
                              title="রিপ্লাই দিতে ডাবল-ক্লিক করুন"
                              className={`min-w-0 rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed break-words shadow-2xs transition-shadow ${
                                isMine
                                  ? 'bg-[#0f4c3a] text-white rounded-br-sm'
                                  : 'bg-white border border-slate-200 text-slate-900 rounded-bl-sm'
                              } ${isHighlighted ? 'ring-2 ring-amber-400' : ''}`}
                            >
                              {/* Quoted Reply Reference */}
                              {(msg.replyToText || msg.replyToMessageId) && (
                                <button
                                  type="button"
                                  onClick={() => handleJumpToMessage(msg.replyToMessageId)}
                                  className={`w-full text-left mb-2 pl-2.5 pr-2.5 py-1.5 rounded-lg text-[11px] border-l-[3px] transition-colors cursor-pointer ${
                                    isMine
                                      ? 'bg-emerald-950/65 hover:bg-emerald-950/85 text-emerald-50 border-amber-400'
                                      : 'bg-slate-100 hover:bg-slate-200/70 text-slate-700 border-emerald-700'
                                  }`}
                                >
                                  <div className="font-bold text-[10px] flex items-center gap-1 opacity-95">
                                    <Reply className="w-3 h-3 shrink-0" />
                                    <span className="truncate">
                                      {msg.replyToSenderName || 'মূল বার্তা'}
                                    </span>
                                  </div>
                                  <div className="line-clamp-2 opacity-85 mt-0.5">
                                    {msg.replyToText || 'মূল বার্তা দেখুন'}
                                  </div>
                                </button>
                              )}

                              <p className="whitespace-pre-wrap">{msg.text}</p>

                              <div
                                className={`mt-1.5 flex items-center justify-end gap-1.5 text-[10px] tabular-nums whitespace-nowrap ${
                                  isMine ? 'text-emerald-100/90' : 'text-slate-400'
                                }`}
                              >
                                <span className="whitespace-nowrap">
                                  {formatMessageTime(msg.createdAt)}
                                </span>
                                {isMine &&
                                  (isReadByRecipient ? (
                                    <span
                                      className="inline-flex items-center gap-0.5 text-sky-300 font-semibold shrink-0"
                                      title={
                                        activeConversation.type === 'group' && readerNames
                                          ? `পঠিত (${readerIdsExceptSender.length} জন): ${readerNames}`
                                          : 'পঠিত (২টি চিহ্ন)'
                                      }
                                    >
                                      <CheckCheck
                                        className="w-4 h-4 text-sky-300 shrink-0"
                                        strokeWidth={2.6}
                                        aria-label="পঠিত"
                                      />
                                      {activeConversation.type === 'group' &&
                                        readerIdsExceptSender.length > 1 && (
                                          <span className="text-[9px]">
                                            {readerIdsExceptSender.length}
                                          </span>
                                        )}
                                    </span>
                                  ) : (
                                    <span
                                      className="inline-flex items-center text-white shrink-0"
                                      title="প্রেরিত (১টি চিহ্ন · এখনো পড়া হয়নি)"
                                    >
                                      <Check
                                        className="w-3.5 h-3.5 text-white shrink-0"
                                        strokeWidth={2.6}
                                        aria-label="প্রেরিত"
                                      />
                                    </span>
                                  ))}
                              </div>
                            </div>

                            {/* Always-accessible Reply Button */}
                            <button
                              type="button"
                              onClick={() => {
                                setReplyTarget(msg);
                                inputRef.current?.focus();
                              }}
                              title="এই মেসেজে রিপ্লাই দিন"
                              aria-label="রিপ্লাই দিন"
                              className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-emerald-900 hover:border-emerald-300 hover:bg-emerald-50 text-[10px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0 shadow-2xs"
                            >
                              <Reply className="w-3 h-3" />
                              <span className="hidden sm:inline">রিপ্লাই</span>
                            </button>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Banner + Message Composer */}
              <div className="p-3 border-t border-slate-200 bg-white shrink-0 space-y-2">
                {replyTarget && (
                  <div className="flex items-center justify-between gap-2 pl-3 pr-2.5 py-2 rounded-lg bg-emerald-50/80 border border-emerald-200 border-l-4 border-l-emerald-800 text-xs">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-emerald-950 flex items-center gap-1">
                        <Reply className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
                        <span className="truncate">রিপ্লাই দিচ্ছেন: {replyTarget.senderName}</span>
                      </div>
                      <p className="text-[11px] text-slate-700 truncate mt-0.5">
                        {replyTarget.text}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyTarget(null)}
                      className="p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-emerald-100 cursor-pointer shrink-0"
                      aria-label="রিপ্লাই বাতিল"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <form onSubmit={handleSendMessage} className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="আপনার বার্তা লিখুন... (পাঠাতে Enter চাপুন)"
                    className="flex-1 resize-none px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-700 focus:outline-none text-xs text-slate-900 max-h-28"
                  />
                  <button
                    type="submit"
                    disabled={!messageInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-[#0f4c3a] hover:bg-emerald-900 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">পাঠান</span>
                  </button>
                </form>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 border border-slate-200 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">নতুন গ্রুপ চ্যাট তৈরি করুন</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  গ্রুপের নাম দিন এবং সদস্যদের নির্বাচন করুন
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateGroup(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGroupSubmit} className="space-y-3.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">গ্রুপের নাম *</label>
                <input
                  type="text"
                  required
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  placeholder="যেমন: পরীক্ষা নিয়ন্ত্রণ কমিটি / সেমিনার টিম"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900 focus:border-emerald-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">বিভাগ (ঐচ্ছিক)</label>
                <input
                  type="text"
                  value={groupDepartment}
                  onChange={(e) => setGroupDepartment(e.target.value)}
                  placeholder="যেমন: গবেষণা বিভাগ"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900 focus:border-emerald-700 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">
                    সদস্য নির্বাচন ({groupSelectedIds.length} জন)
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setGroupSelectedIds(
                        groupSelectedIds.length === activeEmployees.length
                          ? [currentUser.id].filter(Boolean)
                          : activeEmployees.map((e) => e.id)
                      )
                    }
                    className="text-[11px] font-semibold text-emerald-800 hover:underline cursor-pointer"
                  >
                    {groupSelectedIds.length === activeEmployees.length
                      ? 'সব বাদ দিন'
                      : 'সবাইকে যুক্ত করুন'}
                  </button>
                </div>

                <input
                  type="text"
                  value={groupMemberSearch}
                  onChange={(e) => setGroupMemberSearch(e.target.value)}
                  placeholder="নাম বা বিভাগ দিয়ে খুঁজুন..."
                  className="w-full px-3 py-1.5 mb-2 rounded-lg border border-slate-200 bg-slate-50 text-xs"
                />

                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {activeEmployees
                    .filter((e) => {
                      const q = groupMemberSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        (e.nameBn || '').toLowerCase().includes(q) ||
                        (e.name || '').toLowerCase().includes(q) ||
                        (e.department || '').toLowerCase().includes(q)
                      );
                    })
                    .map((emp) => {
                      const isMe = emp.id === currentUser.id;
                      const checked = isMe || groupSelectedIds.includes(emp.id);
                      return (
                        <label
                          key={emp.id}
                          className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isMe}
                            onChange={() => {
                              setGroupSelectedIds((prev) =>
                                prev.includes(emp.id)
                                  ? prev.filter((id) => id !== emp.id)
                                  : [...prev, emp.id]
                              );
                            }}
                            className="rounded border-slate-300 text-emerald-800"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-900 truncate">
                              {emp.nameBn || emp.name} {isMe ? '(আপনি)' : ''}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate">
                              {emp.designationBn || emp.designation} · {emp.department}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateGroup(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#0f4c3a] hover:bg-emerald-900 text-white font-bold cursor-pointer"
                >
                  গ্রুপ তৈরি করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Group Members Modal */}
      {showManageGroup && activeConversation?.type === 'group' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 border border-slate-200 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {activeConversation.title}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  মোট সদস্য: {editGroupMemberIds.length} জন
                  {activeConversation.isDefaultGroup ? ' · প্রাতিষ্ঠানিক ডিফল্ট গ্রুপ' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowManageGroup(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveGroupMembers} className="space-y-3.5">
              {canManageActiveGroup && !activeConversation.isDefaultGroup && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">গ্রুপের নাম</label>
                  <input
                    type="text"
                    value={editGroupTitle}
                    onChange={(e) => setEditGroupTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900"
                  />
                </div>
              )}

              <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {activeEmployees.map((emp) => {
                  const checked = editGroupMemberIds.includes(emp.id);
                  if (!canManageActiveGroup && !checked) return null;
                  return (
                    <label
                      key={emp.id}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                    >
                      {canManageActiveGroup && (
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={activeConversation.isDefaultGroup && activeConversation.id === 'GRP-GENERAL'}
                          onChange={() => {
                            setEditGroupMemberIds((prev) =>
                              prev.includes(emp.id)
                                ? prev.filter((id) => id !== emp.id)
                                : [...prev, emp.id]
                            );
                          }}
                          className="rounded border-slate-300 text-emerald-800"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 truncate">
                          {emp.nameBn || emp.name}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {emp.designationBn || emp.designation} · {emp.department}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                {canManageActiveGroup && !activeConversation.isDefaultGroup ? (
                  confirmDeleteGroup ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleDeleteCurrentGroup}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white font-bold cursor-pointer"
                      >
                        নিশ্চিত মুছুন
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteGroup(false)}
                        className="px-2 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
                      >
                        না
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteGroup(true)}
                      className="px-3 py-2 rounded-lg text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>গ্রুপ মুছুন</span>
                    </button>
                  )
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowManageGroup(false)}
                    className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold cursor-pointer"
                  >
                    বন্ধ করুন
                  </button>
                  {canManageActiveGroup && (
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-[#0f4c3a] hover:bg-emerald-900 text-white font-bold cursor-pointer"
                    >
                      সংরক্ষণ করুন
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
