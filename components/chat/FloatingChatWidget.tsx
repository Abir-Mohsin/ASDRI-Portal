'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Maximize2,
  MessageSquare,
  Reply,
  Search,
  Send,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import { ChatConversation, ChatMessage, Employee } from '@/lib/types';

function formatShortTime(iso?: string): string {
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

function formatDateDividerLabel(iso?: string): string {
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

export function FloatingChatWidget() {
  const {
    currentUser,
    employees,
    activeNav,
    setActiveNav,
    chatConversations,
    chatMessages,
    activeChatConversationId,
    setActiveChatConversationId,
    unreadChatCount,
    getConversationUnreadCount,
    startDirectChat,
    sendChatMessage,
    markConversationAsRead,
  } = useApp();

  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'thread' | 'people'>('list');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [inputText, setInputText] = useState('');
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const widgetInputRef = useRef<HTMLInputElement>(null);

  const employeeMap = useMemo(() => {
    const map = new Map<string, Employee>();
    employees.forEach((e) => map.set(e.id, e));
    return map;
  }, [employees]);

  const myConversations = useMemo(() => {
    return chatConversations
      .filter((c) => c.isDefaultGroup || c.participantEmployeeIds.includes(currentUser.id))
      .sort((a, b) => {
        const aTime = a.lastMessageAt || a.updatedAt || a.createdAt || '';
        const bTime = b.lastMessageAt || b.updatedAt || b.createdAt || '';
        if (a.lastMessageAt && !b.lastMessageAt) return -1;
        if (!a.lastMessageAt && b.lastMessageAt) return 1;
        return bTime.localeCompare(aTime);
      });
  }, [chatConversations, currentUser.id]);

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

  const activeConv = useMemo(() => {
    const targetId = selectedConvId || activeChatConversationId;
    return myConversations.find((c) => c.id === targetId) || null;
  }, [myConversations, selectedConvId, activeChatConversationId]);

  const threadMessages = useMemo(() => {
    if (!activeConv) return [];
    return chatMessages
      .filter((m) => m.conversationId === activeConv.id)
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  }, [chatMessages, activeConv]);

  const hasUnreadInThread = useMemo(() => {
    if (!activeConv || !currentUser.id) return false;
    return threadMessages.some(
      (m) =>
        m.senderEmployeeId !== currentUser.id &&
        !(m.readByEmployeeIds || []).includes(currentUser.id)
    );
  }, [activeConv, threadMessages, currentUser.id]);

  useEffect(() => {
    if (isOpen && viewMode === 'thread' && activeConv?.id) {
      if (hasUnreadInThread) {
        markConversationAsRead(activeConv.id);
      }
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, viewMode, activeConv?.id, threadMessages.length, hasUnreadInThread, markConversationAsRead]);

  const handleJumpToWidgetMessage = (messageId?: string) => {
    if (!messageId) return;
    const el = document.getElementById(`widget-msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(messageId);
      window.setTimeout(() => {
        setHighlightedMsgId((prev) => (prev === messageId ? null : prev));
      }, 1800);
    }
  };

  // Hide widget on the full Internal Chat page
  if (activeNav === 'chat') return null;

  const getDisplayName = (conv: ChatConversation) => {
    if (conv.type === 'direct') {
      const otherId = conv.participantEmployeeIds.find((id) => id !== currentUser.id) || currentUser.id;
      const emp = employeeMap.get(otherId);
      return emp ? emp.nameBn || emp.name : conv.title;
    }
    return conv.title;
  };

  const handleOpenThread = (convId: string) => {
    setSelectedConvId(convId);
    setActiveChatConversationId(convId);
    setReplyTarget(null);
    setViewMode('thread');
    markConversationAsRead(convId);
  };

  const handleQuickDirect = (empId: string) => {
    const convId = startDirectChat(empId);
    if (convId) {
      handleOpenThread(convId);
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || !inputText.trim()) return;
    sendChatMessage({
      conversationId: activeConv.id,
      text: inputText,
      replyToMessageId: replyTarget?.id,
      replyToSenderName: replyTarget?.senderName,
      replyToText: replyTarget?.text?.slice(0, 160),
    });
    setInputText('');
    setReplyTarget(null);
  };

  const handleExpandFullChat = () => {
    if (activeConv) {
      setActiveChatConversationId(activeConv.id);
    }
    setIsOpen(false);
    setActiveNav('chat');
  };

  const q = searchText.trim().toLowerCase();

  return (
    <div className="fixed bottom-4 right-4 z-40">
      {isOpen ? (
        <div className="w-[calc(100vw-2rem)] sm:w-[370px] h-[480px] max-h-[80vh] bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
          {/* Widget Header */}
          <div className="px-3.5 py-2.5 bg-emerald-950 text-white flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {viewMode !== 'list' && (
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('list');
                    setReplyTarget(null);
                  }}
                  className="p-1 rounded-md hover:bg-emerald-900 text-emerald-100 cursor-pointer"
                  aria-label="তালিকায় ফিরুন"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <div className="min-w-0">
                <div className="text-xs font-bold truncate">
                  {viewMode === 'thread' && activeConv
                    ? getDisplayName(activeConv)
                    : viewMode === 'people'
                    ? 'সহকর্মীকে বার্তা পাঠান'
                    : 'কুইক চ্যাট'}
                </div>
                {viewMode === 'thread' && activeConv && (
                  <div className="text-[10px] text-emerald-200/80 truncate">
                    {activeConv.type === 'group'
                      ? `${activeConv.participantEmployeeIds.length} জন সদস্য`
                      : 'ব্যক্তিগত চ্যাট'}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleExpandFullChat}
                title="পূর্ণাঙ্গ চ্যাট পেজ খুলুন"
                aria-label="পূর্ণাঙ্গ চ্যাট পেজ খুলুন"
                className="p-1.5 rounded-lg hover:bg-emerald-900 text-emerald-100 cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="বন্ধ করুন"
                aria-label="বন্ধ করুন"
                className="p-1.5 rounded-lg hover:bg-emerald-900 text-emerald-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Widget Body */}
          {viewMode === 'list' && (
            <>
              <div className="p-2.5 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="খুঁজুন..."
                    className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:border-emerald-700"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setViewMode('people')}
                  className="px-2.5 py-1.5 rounded-lg bg-[#0f4c3a] hover:bg-emerald-900 text-white text-[11px] font-bold whitespace-nowrap cursor-pointer"
                >
                  + নতুন চ্যাট
                </button>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {myConversations
                  .filter((c) => !q || getDisplayName(c).toLowerCase().includes(q))
                  .map((conv) => {
                    const unread = getConversationUnreadCount(conv.id);
                    return (
                      <button
                        key={conv.id}
                        type="button"
                        onClick={() => handleOpenThread(conv.id)}
                        className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-slate-50 text-left cursor-pointer"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5 min-w-0">
                              {conv.type === 'group' && (
                                <Users className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
                              )}
                              <span className="truncate">{getDisplayName(conv)}</span>
                            </span>
                            <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                              {formatShortTime(conv.lastMessageAt)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            {(() => {
                              const myEmpId = (currentUser.id || '').trim();
                              const lastMsg = lastMessageByConvId.get(conv.id);
                              const isLastMine = lastMsg
                                ? (lastMsg.senderEmployeeId || '').trim() === myEmpId
                                : (conv.lastMessageSenderId || '').trim() === myEmpId;
                              const isLastRead = lastMsg
                                ? (lastMsg.readByEmployeeIds || []).filter(
                                    (id) =>
                                      id &&
                                      id.trim() !== (lastMsg.senderEmployeeId || '').trim()
                                  ).length > 0
                                : false;
                              return (
                                <span className="text-[11px] text-slate-500 truncate flex items-center gap-1 min-w-0">
                                  {isLastMine &&
                                    (isLastRead ? (
                                      <CheckCheck
                                        className="w-3.5 h-3.5 text-sky-600 shrink-0"
                                        strokeWidth={2.6}
                                        aria-label="পঠিত"
                                      />
                                    ) : (
                                      <Check
                                        className="w-3.5 h-3.5 text-slate-500 shrink-0"
                                        strokeWidth={2.6}
                                        aria-label="প্রেরিত"
                                      />
                                    ))}
                                  <span className="truncate">
                                    {conv.lastMessageText || 'কথোপকথন শুরু করুন'}
                                  </span>
                                </span>
                              );
                            })()}
                            {unread > 0 && (
                              <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-amber-500 text-slate-950 text-[10px] font-extrabold tabular-nums flex items-center justify-center shrink-0">
                                {unread}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </>
          )}

          {viewMode === 'people' && (
            <>
              <div className="p-2.5 border-b border-slate-200 bg-slate-50">
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="সহকর্মীর নাম বা বিভাগ লিখুন..."
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900"
                />
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {employees
                  .filter((e) => e.status === 'Active' && e.id !== currentUser.id)
                  .filter(
                    (e) =>
                      !q ||
                      (e.nameBn || '').toLowerCase().includes(q) ||
                      (e.name || '').toLowerCase().includes(q) ||
                      (e.department || '').toLowerCase().includes(q)
                  )
                  .map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => handleQuickDirect(emp.id)}
                      className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-emerald-50/50 text-left cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {emp.nameBn || emp.name}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {emp.designationBn || emp.designation} · {emp.department}
                        </div>
                      </div>
                      <span className="text-[11px] font-bold text-emerald-800 shrink-0">চ্যাট</span>
                    </button>
                  ))}
              </div>
            </>
          )}

          {viewMode === 'thread' && activeConv && (
            <>
              <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-slate-50/70">
                {threadMessages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    প্রথম বার্তা পাঠিয়ে আলোচনা শুরু করুন
                  </div>
                ) : (
                  threadMessages.map((msg, idx) => {
                    const myEmpId = (currentUser.id || '').trim();
                    const senderId = (msg.senderEmployeeId || '').trim();
                    const isMine = Boolean(myEmpId) && senderId === myEmpId;
                    const currentDateKey = getDateKey(msg.createdAt);
                    const prevDateKey = idx > 0 ? getDateKey(threadMessages[idx - 1].createdAt) : '';
                    const showDateDivider =
                      idx === 0 || (Boolean(currentDateKey) && currentDateKey !== prevDateKey);
                    const readerIdsExceptSender = (msg.readByEmployeeIds || []).filter(
                      (id) => id && id.trim() !== senderId
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
                        {showDateDivider && formatDateDividerLabel(msg.createdAt) && (
                          <div className="flex items-center gap-2 my-2.5">
                            <div className="flex-1 h-px bg-slate-200/90" />
                            <span className="px-2.5 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] text-slate-600 font-semibold shadow-2xs">
                              {formatDateDividerLabel(msg.createdAt)}
                            </span>
                            <div className="flex-1 h-px bg-slate-200/90" />
                          </div>
                        )}
                        <div
                          id={`widget-msg-${msg.id}`}
                          className={`group flex flex-col rounded-xl ${
                            isMine ? 'items-end' : 'items-start'
                          } ${isHighlighted ? 'bg-amber-100/70 p-1 -m-1' : ''}`}
                        >
                          {!isMine && activeConv.type === 'group' && (
                            <span className="text-[10px] font-semibold text-slate-500 mb-0.5 px-1">
                              {msg.senderName}
                            </span>
                          )}
                          <div
                            className={`flex items-end gap-1.5 max-w-[92%] ${
                              isMine ? 'flex-row-reverse' : 'flex-row'
                            }`}
                          >
                            <div
                              onDoubleClick={() => {
                                setReplyTarget(msg);
                                widgetInputRef.current?.focus();
                              }}
                              title="রিপ্লাই দিতে ডাবল-ক্লিক করুন"
                              className={`min-w-0 px-3 py-2 rounded-2xl text-xs break-words shadow-2xs ${
                                isMine
                                  ? 'bg-[#0f4c3a] text-white rounded-br-sm'
                                  : 'bg-white border border-slate-200 text-slate-900 rounded-bl-sm'
                              } ${isHighlighted ? 'ring-2 ring-amber-400' : ''}`}
                            >
                              {(msg.replyToText || msg.replyToMessageId) && (
                                <button
                                  type="button"
                                  onClick={() => handleJumpToWidgetMessage(msg.replyToMessageId)}
                                  className={`w-full text-left mb-1.5 pl-2 pr-2 py-1 rounded text-[10px] border-l-[3px] cursor-pointer ${
                                    isMine
                                      ? 'bg-emerald-950/65 text-emerald-50 border-amber-400'
                                      : 'bg-slate-100 text-slate-700 border-emerald-700'
                                  }`}
                                >
                                  <div className="font-bold flex items-center gap-1">
                                    <Reply className="w-2.5 h-2.5 shrink-0" />
                                    <span className="truncate">
                                      {msg.replyToSenderName || 'মূল বার্তা'}
                                    </span>
                                  </div>
                                  <div className="line-clamp-1 opacity-85">
                                    {msg.replyToText || 'মূল বার্তা দেখুন'}
                                  </div>
                                </button>
                              )}
                              <p className="whitespace-pre-wrap">{msg.text}</p>
                              <div
                                className={`text-[10px] mt-1.5 flex items-center justify-end gap-1.5 tabular-nums whitespace-nowrap ${
                                  isMine ? 'text-emerald-100/90' : 'text-slate-400'
                                }`}
                              >
                                <span className="whitespace-nowrap">
                                  {formatShortTime(msg.createdAt)}
                                </span>
                                {isMine &&
                                  (isReadByRecipient ? (
                                    <span
                                      title={
                                        activeConv.type === 'group' && readerNames
                                          ? `পঠিত (${readerIdsExceptSender.length} জন): ${readerNames}`
                                          : 'পঠিত (২টি চিহ্ন)'
                                      }
                                      className="inline-flex items-center gap-0.5 text-sky-300 font-semibold shrink-0"
                                    >
                                      <CheckCheck
                                        className="w-4 h-4 text-sky-300 shrink-0"
                                        strokeWidth={2.6}
                                        aria-label="পঠিত"
                                      />
                                      {activeConv.type === 'group' &&
                                        readerIdsExceptSender.length > 1 && (
                                          <span className="text-[9px]">
                                            {readerIdsExceptSender.length}
                                          </span>
                                        )}
                                    </span>
                                  ) : (
                                    <span
                                      title="প্রেরিত (১টি চিহ্ন · এখনো পড়া হয়নি)"
                                      className="inline-flex items-center text-white shrink-0"
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
                            <button
                              type="button"
                              onClick={() => {
                                setReplyTarget(msg);
                                widgetInputRef.current?.focus();
                              }}
                              title="রিপ্লাই দিন"
                              aria-label="রিপ্লাই দিন"
                              className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-emerald-900 hover:border-emerald-300 hover:bg-emerald-50 cursor-pointer shrink-0 shadow-2xs"
                            >
                              <Reply className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              <div className="p-2.5 border-t border-slate-200 bg-white space-y-1.5">
                {replyTarget && (
                  <div className="flex items-center justify-between gap-2 pl-2.5 pr-2 py-1.5 rounded-lg bg-emerald-50/80 border border-emerald-200 border-l-4 border-l-emerald-800 text-[11px]">
                    <div className="min-w-0">
                      <div className="font-bold text-emerald-950 flex items-center gap-1 text-[10px]">
                        <Reply className="w-3 h-3 text-emerald-800 shrink-0" />
                        <span className="truncate">রিপ্লাই: {replyTarget.senderName}</span>
                      </div>
                      <div className="truncate text-slate-700">{replyTarget.text}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyTarget(null)}
                      className="text-slate-500 hover:text-slate-800 cursor-pointer shrink-0"
                      aria-label="রিপ্লাই বাতিল"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <form onSubmit={handleSend} className="flex items-center gap-1.5">
                  <input
                    ref={widgetInputRef}
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="বার্তা লিখুন..."
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:border-emerald-700 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!inputText.trim()}
                    className="p-2 rounded-xl bg-[#0f4c3a] hover:bg-emerald-900 disabled:opacity-50 text-white cursor-pointer shrink-0"
                    aria-label="পাঠান"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="অভ্যন্তরীণ চ্যাট খুলুন"
          className="relative h-12 px-4 rounded-full bg-[#0f4c3a] hover:bg-emerald-900 text-white shadow-lg border border-amber-400/40 flex items-center gap-2 transition-transform hover:scale-[1.02] cursor-pointer"
        >
          <MessageSquare className="w-4 h-4 text-amber-300" />
          <span className="text-xs font-bold whitespace-nowrap">চ্যাট</span>
          {unreadChatCount > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-amber-400 text-slate-950 text-[11px] font-extrabold tabular-nums flex items-center justify-center">
              {unreadChatCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
