import { BuilderPanel } from '@/components/v1/builder-panel';
import { ChatMessageContent, copyChatText } from '@/components/v1/chat-message-content';
import { Button } from '@/components/ui/button';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Clock,
  Check,
  Copy,
  Pencil,
  History,
  Loader2,
  Mic,
  Paperclip,
  Plus,
  Send,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import { sendChatMessage, V1ApiError } from '@/lib/v1/client';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'V1 Test App' },
      {
        name: 'description',
        content:
          'The V1 Workspace pairs a multi-assistant chat terminal with an app and web builder preview, chat history, file attachments and voice input in one dark console.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
      {
        property: 'og:title',
        content: 'V1 Test App',
      },
      {
        property: 'og:description',
        content:
          'A multi-assistant chat terminal with tabs, history and voice input beside a live app and web builder preview.',
      },
    ],
  }),
  component: WorkspacePage,
});

/* ---------------- model ---------------- */

const PROVIDERS = {
  v1: 'V1',
  chatgpt: 'ChatGPT',
  grok: 'Grok',
  gemini: 'Gemini',
  aistudio: 'AI Studio',
} as const;
type ProviderId = keyof typeof PROVIDERS;
const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];
/** UI tab → server provider id. V1 = server-chosen Admin AI (or built-in engine). */
const SERVER_PROVIDER: Record<ProviderId, 'openai' | 'gemini' | 'xai' | undefined> = {
  v1: undefined,
  chatgpt: 'openai',
  grok: 'xai',
  gemini: 'gemini',
  aistudio: 'gemini',
};

const DOT_COLORS: Record<ProviderId, string> = {
  v1: 'var(--ws-accent)',
  chatgpt: '#6FBF8F',
  grok: '#8B899C',
  gemini: '#5A9BD8',
  aistudio: '#D89B4E',
};

type WsMessage = {
  role: 'user' | 'assistant';
  content: string;
  file?: string;
  time: number;
};

type Conversation = {
  id: string;
  title: string;
  provider: ProviderId;
  messages: WsMessage[];
  createdAt: number;
  updatedAt: number;
};

type WsState = {
  conversations: Record<string, Conversation>;
  openTabs: Record<ProviderId, string[]>;
  activeTab: Partial<Record<ProviderId, string>>;
};

const STORAGE_KEY = 'v1_workspace_state_v2';

function generateId() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function autoTitle(text: string) {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return 'New conversation';
  return clean.length > 32 ? `${clean.slice(0, 32)}…` : clean;
}

function keepTextareaCaretVisible(textarea: HTMLTextAreaElement) {
  const selectionEnd = textarea.selectionEnd;
  if (selectionEnd === textarea.value.length) {
    textarea.scrollTop = textarea.scrollHeight;
    return;
  }

  const computed = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const marker = document.createElement('span');
  mirror.style.position = 'fixed';
  mirror.style.left = '-9999px';
  mirror.style.top = '0';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.boxSizing = computed.boxSizing;
  mirror.style.padding = computed.padding;
  mirror.style.border = computed.border;
  mirror.style.font = computed.font;
  mirror.style.letterSpacing = computed.letterSpacing;
  mirror.style.lineHeight = computed.lineHeight;
  mirror.textContent = textarea.value.slice(0, selectionEnd);
  marker.textContent = '\u200b';
  mirror.append(marker);
  document.body.append(mirror);

  const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
  const caretTop = marker.offsetTop;
  const visibleTop = textarea.scrollTop;
  const visibleBottom = visibleTop + textarea.clientHeight - lineHeight;
  if (caretTop < visibleTop) textarea.scrollTop = caretTop;
  else if (caretTop > visibleBottom) textarea.scrollTop = caretTop - textarea.clientHeight + lineHeight * 2;
  mirror.remove();
}

function emptyTabs(): Record<ProviderId, string[]> {
  return Object.fromEntries(
    PROVIDER_IDS.map((p) => [p, [] as string[]]),
  ) as unknown as Record<ProviderId, string[]>;
}

function normalize(raw: unknown): WsState {
  const source = (raw ?? {}) as Partial<WsState>;
  const conversations = { ...(source.conversations ?? {}) };
  const openTabs = emptyTabs();
  for (const provider of PROVIDER_IDS) {
    const ids = source.openTabs?.[provider];
    openTabs[provider] = Array.isArray(ids)
      ? ids.filter((id) => Boolean(conversations[id]))
      : [];
  }
  const state: WsState = {
    conversations,
    openTabs,
    activeTab: { ...(source.activeTab ?? {}) },
  };
  return ensureTabs(state);
}

function ensureTabs(state: WsState): WsState {
  const next: WsState = {
    conversations: { ...state.conversations },
    openTabs: { ...state.openTabs },
    activeTab: { ...state.activeTab },
  };
  for (const provider of PROVIDER_IDS) {
    const ids = [...(next.openTabs[provider] ?? [])];
    if (ids.length === 0) {
      const id = generateId();
      next.conversations[id] = {
        id,
        title: 'New conversation',
        provider,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      ids.push(id);
    }
    next.openTabs[provider] = ids;
    const active = next.activeTab[provider];
    if (!active || !ids.includes(active)) {
      next.activeTab[provider] = ids[ids.length - 1] ?? '';
    }
  }
  return next;
}

/* ---------------- builder ---------------- */

const TOOLS = [
  'Prompt',
  'Generate',
  'Edit',
  'Preview',
  'Files',
  'Deploy',
] as const;
type Tool = (typeof TOOLS)[number];

const DEVICES = {
  Desktop: '850px',
  Tablet: '620px',
  Mobile: '380px',
} as const;
type Device = keyof typeof DEVICES;

const FILES = [
  '📁 src',
  '　📄 App.jsx',
  '　📁 components',
  '　📁 pages',
  '📄 package.json',
  '📄 README.md',
];

/* ---------------- page ---------------- */

function WorkspagePlaceholder() {
  return null;
}

function WorkspacePage() {
  const [state, setState] = useState<WsState>(() =>
    normalize({ conversations: {}, openTabs: emptyTabs(), activeTab: {} }),
  );
  const [hydrated, setHydrated] = useState(false);
  const [provider, setProvider] = useState<ProviderId>('v1');
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState<{ conversationId: string; index: number } | null>(null);
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('Preview');
  const [device, setDevice] = useState<Device>('Desktop');
  const [filesOpen, setFilesOpen] = useState(false);
  const [keyboardViewport, setKeyboardViewport] = useState<{ top: number; height: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const builderConversationRef = useRef<string | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const keyboardOpen = document.activeElement === composerRef.current
        && viewport.height < window.innerHeight - 100;
      setKeyboardViewport(keyboardOpen ? { top: viewport.offsetTop, height: viewport.height } : null);
    };
    const scheduleUpdate = () => window.requestAnimationFrame(update);
    update();
    viewport.addEventListener('resize', scheduleUpdate);
    viewport.addEventListener('scroll', scheduleUpdate);
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('focusin', scheduleUpdate);
    window.addEventListener('focusout', scheduleUpdate);
    return () => {
      viewport.removeEventListener('resize', scheduleUpdate);
      viewport.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('focusin', scheduleUpdate);
      window.removeEventListener('focusout', scheduleUpdate);
    };
  }, []);

  useLayoutEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    textarea.setSelectionRange(selectionStart, selectionEnd);
    keepTextareaCaretVisible(textarea);
  }, [input]);

  const activeId = state.activeTab[provider];
  const conversation = activeId ? state.conversations[activeId] : undefined;
  const messages = conversation?.messages ?? [];
  const openTabs = state.openTabs[provider] ?? [];
  const editingHere = editing?.conversationId === activeId ? editing : null;

  useEffect(() => {
    if (editing && editing.conversationId !== activeId) {
      setEditing(null);
      setInput('');
      setAttachedFile(null);
    }
  }, [activeId, editing]);

  /* load + persist */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setState(normalize(JSON.parse(raw)));
    } catch {
      /* ignore unreadable storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      setToast('Could not save — storage may be full');
    }
  }, [state, hydrated]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, pending]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!copiedMessage) return;
    const timer = window.setTimeout(() => setCopiedMessage(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copiedMessage]);

  async function copyMessage(content: string, key: string) {
    if (await copyChatText(content)) setCopiedMessage(key);
    else setToast('Could not copy message. Check clipboard permissions.');
  }

  function editMessage(message: WsMessage, index: number) {
    if (!activeId || pending) return;
    setEditing({ conversationId: activeId, index });
    setInput(message.content);
    setAttachedFile(message.file ?? null);
    composerRef.current?.focus();
  }

  function showGeneratedInChat(prompt: string, result: string) {
    const targetId = builderConversationRef.current ?? activeId;
    if (!targetId) return;
    const now = Date.now();
    setState((prev) => {
      const conv = prev.conversations[targetId];
      if (!conv) return prev;
      const providerTabs = prev.openTabs[conv.provider] ?? [];
      return {
        ...prev,
        openTabs: {
          ...prev.openTabs,
          [conv.provider]: providerTabs.includes(targetId)
            ? providerTabs
            : [...providerTabs, targetId],
        },
        activeTab: { ...prev.activeTab, [conv.provider]: targetId },
        conversations: {
          ...prev.conversations,
          [targetId]: {
            ...conv,
            title: conv.messages.length === 0 ? autoTitle(prompt) : conv.title,
            messages: [
              ...conv.messages,
              { role: 'user', content: prompt, time: now },
              { role: 'assistant', content: result, time: now },
            ],
            updatedAt: now,
          },
        },
      };
    });
    const targetProvider = state.conversations[targetId]?.provider;
    if (targetProvider) setProvider(targetProvider);
    builderConversationRef.current = null;
    setBuilderOpen(false);
  }

  const historyItems = useMemo(
    () =>
      Object.values(state.conversations)
        .filter((conv) => conv.messages.length > 0)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [state.conversations],
  );

  const newTab = useCallback(() => {
    const id = generateId();
    setState((prev) => ({
      ...prev,
      conversations: {
        ...prev.conversations,
        [id]: {
          id,
          title: 'New conversation',
          provider,
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
      openTabs: { ...prev.openTabs, [provider]: [...openTabs, id] },
      activeTab: { ...prev.activeTab, [provider]: id },
    }));
  }, [provider, openTabs]);

  const closeTab = useCallback(
    (id: string) => {
      setState((prev) => {
        const next: WsState = {
          conversations: { ...prev.conversations },
          openTabs: {
            ...prev.openTabs,
            [provider]: (prev.openTabs[provider] ?? []).filter(
              (item) => item !== id,
            ),
          },
          activeTab: { ...prev.activeTab },
        };
        delete next.conversations[id];
        if (next.activeTab[provider] === id) delete next.activeTab[provider];
        return ensureTabs(next);
      });
    },
    [provider],
  );

  const openConversation = useCallback((conv: Conversation) => {
    setProvider(conv.provider);
    setState((prev) => {
      const ids = prev.openTabs[conv.provider] ?? [];
      return {
        ...prev,
        openTabs: {
          ...prev.openTabs,
          [conv.provider]: ids.includes(conv.id) ? ids : [...ids, conv.id],
        },
        activeTab: { ...prev.activeTab, [conv.provider]: conv.id },
      };
    });
    setHistoryOpen(false);
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setState((prev) => {
      const next: WsState = {
        conversations: { ...prev.conversations },
        openTabs: { ...prev.openTabs },
        activeTab: { ...prev.activeTab },
      };
      delete next.conversations[id];
      for (const key of PROVIDER_IDS) {
        next.openTabs[key] = (next.openTabs[key] ?? []).filter(
          (item) => item !== id,
        );
        if (next.activeTab[key] === id) delete next.activeTab[key];
      }
      return ensureTabs(next);
    });
  }, []);

  const clearCurrent = useCallback(() => {
    if (!activeId) return;
    setState((prev) => {
      const conv = prev.conversations[activeId];
      if (!conv) return prev;
      return {
        ...prev,
        conversations: {
          ...prev.conversations,
          [activeId]: {
            ...conv,
            messages: [],
            title: 'New conversation',
            updatedAt: Date.now(),
          },
        },
      };
    });
    setToast('Conversation cleared.');
  }, [activeId]);

  const clearAll = useCallback(() => {
    setState(
      normalize({ conversations: {}, openTabs: emptyTabs(), activeTab: {} }),
    );
    setToast('All conversations cleared.');
  }, []);

  function toggleVoice() {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    const Ctor = (
      window as unknown as {
        SpeechRecognition?: new () => never;
        webkitSpeechRecognition?: new () => never;
      }
    ).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => never })
        .webkitSpeechRecognition;
    if (!Ctor) {
      setToast('Voice input is not supported in this browser.');
      return;
    }
    const recognition = new Ctor() as unknown as {
      lang: string;
      interimResults: boolean;
      onresult: (event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void;
      onend: () => void;
      onerror: () => void;
      start: () => void;
      stop: () => void;
    };
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results as ArrayLike<unknown>)
        .map((result) => (result as ArrayLike<{ transcript: string }>)[0])
        .map((alt) => alt?.transcript ?? '')
        .join(' ')
        .trim();
      if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => setRecording(false);
    recognition.onerror = () => {
      setRecording(false);
      setToast('Voice input stopped.');
    };
    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  }

  async function submit(event?: React.FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || pending || !activeId) return;

    const userMessage: WsMessage = {
      role: 'user',
      content: text,
      time: Date.now(),
      ...(attachedFile ? { file: attachedFile } : {}),
    };
    const editIndex = editingHere && messages[editingHere.index]?.role === 'user'
      ? editingHere.index
      : null;
    const history = editIndex === null
      ? [...messages, userMessage]
      : [...messages.slice(0, editIndex), userMessage];

    setState((prev) => {
      const conv = prev.conversations[activeId];
      if (!conv) return prev;
      return {
        ...prev,
        conversations: {
          ...prev.conversations,
          [activeId]: {
            ...conv,
            messages: history,
            title:
              (conv.messages.length === 0 || editIndex === 0) ? autoTitle(text) : conv.title,
            updatedAt: Date.now(),
          },
        },
      };
    });
    setInput('');
    setEditing(null);
    setAttachedFile(null);
    setError(null);
    setPending(true);

    try {
      const response = await sendChatMessage({
        message: attachedFile ? `${text}\n\n[attached file: ${attachedFile}]` : text,
        mode: 'companion',
        ...(SERVER_PROVIDER[provider] ? { providerId: SERVER_PROVIDER[provider] } : {}),
        history: history
          .slice(-12)
          .map((item) => ({ role: item.role, content: item.content })),
      });
      setState((prev) => {
        const conv = prev.conversations[activeId];
        if (!conv) return prev;
        return {
          ...prev,
          conversations: {
            ...prev.conversations,
            [activeId]: {
              ...conv,
              messages: [
                ...history,
                {
                  role: 'assistant',
                  content: response.message,
                  time: Date.now(),
                },
              ],
              updatedAt: Date.now(),
            },
          },
        };
      });
    } catch (caught) {
      if (editIndex !== null) {
        setState((prev) => {
          const conv = prev.conversations[activeId];
          if (!conv) return prev;
          return {
            ...prev,
            conversations: {
              ...prev.conversations,
              [activeId]: { ...conv, messages, title: conversation?.title ?? conv.title },
            },
          };
        });
        setInput(text);
        setAttachedFile(userMessage.file ?? null);
        setEditing({ conversationId: activeId, index: editIndex });
      }
      setError(
        caught instanceof V1ApiError
          ? caught.message
          : 'V1 could not reach its model engine. Try again in a moment.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={`v1ws flex justify-center ${keyboardViewport ? 'fixed inset-x-0 z-10' : 'h-[100dvh]'}`}
      style={keyboardViewport ? { top: keyboardViewport.top, height: keyboardViewport.height } : undefined}
    >
      <div
        className="flex h-full w-full max-w-[620px] flex-col border-x"
        style={{
          borderColor: 'var(--ws-line)',
          background: 'var(--ws-panel)',
        }}
      >
        {/* header */}
        <header
          className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--ws-line)' }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg font-mono text-[12.5px] font-semibold"
              style={{ background: 'var(--ws-accent)', color: 'var(--ws-base)' }}
            >
              V1
            </span>
            <span className="truncate text-[14.5px] font-medium">
              V1 Workspace
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <IconButton label="History" onClick={() => setHistoryOpen(true)}>
              <Clock className="h-4 w-4" />
            </IconButton>
            <button
              type="button"
              onClick={() => setToast('Workspace saved on this device.')}
              className="rounded-[7px] px-[15px] py-[7px] text-[13px] font-semibold"
              style={{ background: 'var(--ws-accent)', color: 'var(--ws-base)' }}
              data-testid="button-save-workspace"
            >
              Save
            </button>
            <IconButton label="Settings" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
            </IconButton>
          </div>
        </header>

        {/* provider tabs */}
        <div className="ws-noscroll flex shrink-0 gap-0.5 overflow-x-auto px-4 pt-2.5">
          {PROVIDER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setProvider(id)}
              className="relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 pb-3 pt-2 text-[13px] font-medium"
              style={{
                color:
                  provider === id ? 'var(--ws-text)' : 'var(--ws-muted)',
              }}
              data-testid={`button-provider-${id}`}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: DOT_COLORS[id] }}
              />
              {PROVIDERS[id]}
              {provider === id ? (
                <span
                  className="absolute inset-x-3 bottom-0 h-0.5 rounded-t"
                  style={{ background: 'var(--ws-accent)' }}
                />
              ) : null}
            </button>
          ))}
        </div>

        {/* chat tabs */}
        <div className="flex shrink-0 items-center gap-2 px-4 pt-2">
          <div className="ws-noscroll flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {openTabs.map((id) => {
              const conv = state.conversations[id];
              if (!conv) return null;
              const active = id === activeId;
              return (
                <span
                  key={id}
                  className="flex max-w-[110px] shrink-0 items-center gap-1.5 rounded-t-[7px] border border-b-0 py-1.5 pl-2.5 pr-1.5 text-xs sm:max-w-[150px]"
                  style={{
                    borderColor: 'var(--ws-line)',
                    background: active
                      ? 'var(--ws-bubble-bot)'
                      : 'var(--ws-raised)',
                    color: active ? 'var(--ws-text)' : 'var(--ws-muted)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setState((prev) => ({
                        ...prev,
                        activeTab: { ...prev.activeTab, [provider]: id },
                      }))
                    }
                    className="max-w-[70px] truncate sm:max-w-[100px]"
                    data-testid={`button-chat-tab-${id}`}
                  >
                    {conv.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => closeTab(id)}
                    aria-label="Close tab"
                    className="grid h-[15px] w-[15px] shrink-0 place-items-center rounded"
                    style={{ color: 'var(--ws-dim)' }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
          <button
            type="button"
            onClick={newTab}
            className="flex shrink-0 items-center gap-1.5 rounded-[7px] border border-dashed px-2.5 py-1.5 text-xs"
            style={{ borderColor: 'var(--ws-line)', color: 'var(--ws-muted)' }}
            data-testid="button-new-tab"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New tab</span>
          </button>
        </div>

        {/* status bar */}
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-t px-4 pb-2 pt-2.5"
          style={{ borderColor: 'var(--ws-line)' }}
        >
          <span className="truncate font-mono text-[13px] font-medium">
            {PROVIDERS[provider].toLowerCase()} terminal
          </span>
          <span
            className="flex shrink-0 items-center gap-1.5 font-mono text-[11.5px]"
            style={{
              color: pending ? 'var(--ws-warn)' : 'var(--ws-ready)',
            }}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${pending ? 'ws-pulse-fast' : 'ws-pulse'}`}
              style={{
                background: pending ? 'var(--ws-warn)' : 'var(--ws-ready)',
              }}
            />
            {pending ? 'thinking' : 'ready'}
          </span>
        </div>

        {/* thread */}
        <div className="flex-1 overflow-y-auto px-4 pb-2.5 pt-3.5">
          {messages.length === 0 ? (
            <div
              className="px-4 py-12 text-center font-mono text-[12.5px] leading-[1.7]"
              style={{ color: 'var(--ws-dim)' }}
            >
              start a {PROVIDERS[provider].toLowerCase()} thread.
              <br />
              each assistant keeps its own transcript in this workspace.
            </div>
          ) : null}

          {messages.map((message, index) => (
            <div
              key={index}
              className={`ws-msg-in mb-4 flex min-w-0 items-start gap-2.5 ${
                message.role === 'user' ? 'flex-row-reverse' : ''
              }`}
              data-testid={`ws-message-${message.role}`}
            >
              <span
                className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border font-mono text-[10px] font-semibold"
                style={
                  message.role === 'user'
                    ? {
                        background: 'var(--ws-accent)',
                        color: 'var(--ws-base)',
                        borderColor: 'transparent',
                      }
                    : {
                        background: 'var(--ws-raised)',
                        borderColor: 'var(--ws-line)',
                        color: 'var(--ws-muted)',
                      }
                }
              >
                {message.role === 'user' ? 'you' : provider.slice(0, 2)}
              </span>
              <div className="min-w-0 max-w-[calc(100%-2.25rem)] sm:max-w-[80%]">
              <div
                className={`min-w-0 rounded-xl px-3 py-2.5 text-[13.5px] leading-relaxed ${
                  message.role === 'user'
                    ? 'rounded-br-[4px]'
                    : 'rounded-bl-[4px] border'
                }`}
                style={
                  message.role === 'user'
                    ? { background: 'var(--ws-bubble-user)', color: 'var(--ws-text)' }
                    : {
                        background: 'var(--ws-bubble-bot)',
                        borderColor: 'var(--ws-line)',
                      }
                }
              >
                <ChatMessageContent content={message.content} />
                {message.file ? (
                  <span className="mt-1.5 flex w-fit items-center gap-1.5 rounded-md bg-black/20 px-2.5 py-1 text-xs">
                    <Paperclip className="h-3 w-3 shrink-0" />
                    {message.file}
                  </span>
                ) : null}
              </div>
              <div className={`mt-1 flex items-center gap-1 ${message.role === 'user' ? 'justify-end' : ''}`}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-9 px-2 text-[var(--ws-muted)]"
                  title={copiedMessage === `${activeId}-${index}` ? 'Copied' : 'Copy message'}
                  aria-label={copiedMessage === `${activeId}-${index}` ? 'Message copied' : 'Copy message'}
                  onClick={() => void copyMessage(message.content, `${activeId}-${index}`)}
                >
                  {copiedMessage === `${activeId}-${index}` ? <Check /> : <Copy />}
                  <span className="text-xs">{copiedMessage === `${activeId}-${index}` ? 'Copied' : 'Copy'}</span>
                </Button>
                {message.role === 'user' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-9 px-2 text-[var(--ws-muted)]"
                    aria-label="Edit message"
                    title="Edit message"
                    disabled={pending}
                    onClick={() => editMessage(message, index)}
                  >
                    <Pencil />
                    <span className="text-xs">Edit</span>
                  </Button>
                ) : null}
              </div>
              </div>
            </div>
          ))}

          {pending ? (
            <p
              className="flex items-center gap-2 text-sm"
              style={{ color: 'var(--ws-muted)' }}
            >
              <Loader2 className="h-4 w-4 animate-spin" /> thinking…
            </p>
          ) : null}
          {error ? (
            <p
              className="text-sm"
              style={{ color: 'var(--ws-danger)' }}
              data-testid="ws-chat-error"
            >
              {error}
            </p>
          ) : null}
          <div ref={endRef} />
        </div>

        {/* composer */}
        <form
          onSubmit={submit}
          className="shrink-0 border-t px-4 pb-3.5 pt-2.5"
          style={{ borderColor: 'var(--ws-line)' }}
        >
          {editingHere ? (
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-[var(--ws-muted)]">
              <span>Editing message</span>
              <Button type="button" variant="ghost" size="sm" className="min-h-9 px-2 text-[var(--ws-muted)]" onClick={() => { setEditing(null); setInput(''); setAttachedFile(null); }}>Cancel</Button>
            </div>
          ) : null}
          {attachedFile ? (
            <div
              className="flex items-center gap-2 px-1 pb-1.5 text-xs"
              style={{ color: 'var(--ws-muted)' }}
            >
              <Paperclip className="h-3 w-3" />
              <span className="truncate">{attachedFile}</span>
              <button
                type="button"
                onClick={() => setAttachedFile(null)}
                aria-label="Remove file"
                style={{ color: 'var(--ws-dim)' }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
          <div
            className="flex items-end gap-1.5 rounded-[14px] border p-1.5 pl-2.5 focus-within:border-[var(--ws-accent)]"
            style={{
              borderColor: 'var(--ws-line)',
              background: 'var(--ws-raised)',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setAttachedFile(file.name);
                event.target.value = '';
              }}
            />
            <ComposerButton
              label="Attach file"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-[17px] w-[17px]" />
            </ComposerButton>
            <label className="sr-only" htmlFor="ws-message">
              Message {PROVIDERS[provider]}
            </label>
          <textarea
              ref={composerRef}
              id="ws-message"
              rows={1}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                window.requestAnimationFrame(() => {
                  if (composerRef.current) keepTextareaCaretVisible(composerRef.current);
                });
              }}
              onSelect={(event) => keepTextareaCaretVisible(event.currentTarget)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder={`Message ${PROVIDERS[provider]}…`}
              className="max-h-[120px] min-h-[36px] min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-0.5 py-2 text-[13.5px] leading-normal outline-none"
              data-testid="ws-input-message"
            />
            <ComposerButton
              label="Voice input"
              onClick={toggleVoice}
              active={recording}
            >
              <Mic className="h-[17px] w-[17px]" />
            </ComposerButton>
            <button
              type="submit"
              disabled={pending || input.trim().length === 0}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg disabled:opacity-30"
              style={{ background: 'var(--ws-accent)', color: 'var(--ws-base)' }}
              aria-label="Send message"
              data-testid="ws-button-send"
            >
              <Send className="h-[15px] w-[15px]" />
            </button>
          </div>
        </form>

        <div
          className="shrink-0 border-t py-2.5 text-center"
          style={{ borderColor: 'var(--ws-line)' }}
        >
          <button
            type="button"
            onClick={() => {
              builderConversationRef.current = activeId ?? null;
              setBuilderOpen(true);
            }}
            className="text-[12.5px]"
            style={{ color: 'var(--ws-muted)' }}
            data-testid="button-open-builder"
          >
            Open builder →
          </button>
        </div>
      </div>

      {/* history drawer */}
      {historyOpen ? (
        <div
          className="fixed inset-0 z-[25] bg-black/50"
          onClick={() => setHistoryOpen(false)}
        />
      ) : null}
      <aside
        className="fixed inset-y-0 left-0 z-[26] flex w-[min(320px,86vw)] flex-col border-r transition-transform duration-200"
        style={{
          borderColor: 'var(--ws-line)',
          background: 'var(--ws-panel)',
          transform: historyOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}
        data-testid="panel-history"
      >
        <div
          className="flex shrink-0 items-center justify-between border-b px-3.5 pb-2.5 pt-3.5"
          style={{ borderColor: 'var(--ws-line)' }}
        >
          <h3 className="text-[15px] font-medium">History</h3>
          <IconButton label="Close history" onClick={() => setHistoryOpen(false)}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-2.5 pb-4 pt-2">
          {historyItems.length === 0 ? (
            <p
              className="px-3 py-10 text-center text-sm"
              style={{ color: 'var(--ws-dim)' }}
            >
              No conversations yet.
            </p>
          ) : null}
          {historyItems.map((conv) => (
            <div
              key={conv.id}
              className="mb-0.5 rounded-[9px] p-2.5 hover:bg-[var(--ws-raised)]"
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => openConversation(conv)}
                  className="min-w-0 flex-1 truncate text-left text-[13.5px] font-medium"
                >
                  {conv.title}
                </button>
                <button
                  type="button"
                  onClick={() => deleteConversation(conv.id)}
                  aria-label="Delete conversation"
                  className="shrink-0 rounded p-1"
                  style={{ color: 'var(--ws-dim)' }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div
                className="mt-1 flex items-center gap-1.5 text-[11.5px]"
                style={{ color: 'var(--ws-muted)' }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: DOT_COLORS[conv.provider] }}
                />
                {PROVIDERS[conv.provider]} · {conv.messages.length} messages
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* settings */}
      {settingsOpen ? (
        <div className="fixed inset-0 z-20 grid place-items-center bg-black/50 p-5">
          <div
            className="w-full max-w-[340px] rounded-xl border p-4.5 p-[18px]"
            style={{
              borderColor: 'var(--ws-line)',
              background: 'var(--ws-panel)',
            }}
            data-testid="panel-settings"
          >
            <h3 className="mb-3.5 text-[15px] font-medium">Settings</h3>
            <SettingsRow label="Clear current conversation">
              <SmallButton onClick={clearCurrent}>Clear</SmallButton>
            </SettingsRow>
            <SettingsRow label="Clear all conversations">
              <SmallButton onClick={clearAll}>Clear all</SmallButton>
            </SettingsRow>
            <SettingsRow label="Conversations stored">
              <span className="text-[12.5px]">
                {Object.keys(state.conversations).length}
              </span>
            </SettingsRow>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="mt-3.5 w-full rounded-[7px] py-2.5 text-[13px] font-semibold"
              style={{ background: 'var(--ws-accent)', color: 'var(--ws-base)' }}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      {/* builder */}
      {builderOpen ? (
        <div
          className="fixed inset-0 z-30 flex flex-col"
          style={{ background: 'var(--ws-base)' }}
          data-testid="panel-builder"
        >
          <div
            className="flex h-[52px] shrink-0 items-center justify-between border-b px-3.5"
            style={{ borderColor: 'var(--ws-line)' }}
          >
            <p className="font-medium">V1 App / Web Builder</p>
            <div className="flex items-center gap-3">
              <span className="text-xs" style={{ color: 'var(--ws-muted)' }}>
                {tool}
              </span>
              <IconButton
                label="Close builder"
                onClick={() => setBuilderOpen(false)}
              >
                <X className="h-4 w-4" />
              </IconButton>
            </div>
          </div>

          <div
            className="ws-noscroll flex shrink-0 gap-1.5 overflow-x-auto border-b px-3 py-2.5"
            style={{ borderColor: 'var(--ws-line)' }}
          >
            {TOOLS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setTool(item);
                  setFilesOpen(item === 'Files' ? !filesOpen : false);
                  if (item === 'Deploy')
                    setToast('Deploy prep is not wired up yet.');
                }}
                className="whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-sm"
                style={{
                  borderColor:
                    tool === item ? 'var(--ws-accent)' : 'var(--ws-line)',
                  background:
                    tool === item ? 'var(--ws-raised)' : 'var(--ws-panel)',
                }}
                data-testid={`button-tool-${item}`}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-3">
            <div
              className="mb-2 flex items-center justify-between gap-2 text-xs"
              style={{ color: 'var(--ws-muted)' }}
            >
              <span className="truncate">V1 Preview · Live</span>
              <span className="flex shrink-0 gap-1.5">
                {(Object.keys(DEVICES) as Device[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setDevice(item)}
                    className="rounded-[7px] border px-2 py-1"
                    style={{
                      borderColor:
                        device === item
                          ? 'var(--ws-accent)'
                          : 'var(--ws-line)',
                      background: 'var(--ws-panel)',
                    }}
                    data-testid={`button-device-${item}`}
                  >
                    {item}
                  </button>
                ))}
              </span>
            </div>

            <BuilderPanel
              tool={tool}
              maxWidth={DEVICES[device]}
              filesOpen={filesOpen}
              onGenerated={showGeneratedInChat}
            />
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-[7px] border px-4 py-2.5 text-[13px]"
          style={{
            borderColor: 'var(--ws-accent)',
            background: 'var(--ws-raised)',
          }}
          role="status"
          data-testid="ws-toast"
        >
          {toast}
        </div>
      ) : null}
      <WorkspagePlaceholder />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-[7px] border"
      style={{
        borderColor: 'var(--ws-line)',
        background: 'var(--ws-raised)',
        color: 'var(--ws-muted)',
      }}
    >
      {children}
    </button>
  );
}

function ComposerButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
      style={{ color: active ? 'var(--ws-danger)' : 'var(--ws-muted)' }}
    >
      {children}
    </button>
  );
}

function SettingsRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 border-b py-2.5 text-[13.5px] last:border-b-0"
      style={{ borderColor: 'var(--ws-line-soft)' }}
    >
      <span style={{ color: 'var(--ws-muted)' }}>{label}</span>
      {children}
    </div>
  );
}

function SmallButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border px-2.5 py-1.5 text-[12.5px]"
      style={{
        borderColor: 'var(--ws-line)',
        background: 'var(--ws-raised)',
        color: 'var(--ws-text)',
      }}
    >
      {children}
    </button>
  );
}
