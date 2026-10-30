import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VoiceButton, speakText, stopSpeaking } from "@/components/voice-button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Heart,
  Send,
  Loader2,
  Volume2,
  Pill,
  ShoppingCart,
  CalendarCheck,
  Shield,
  Stethoscope,
  HelpCircle,
  Trash2,
  MessageCircle,
  ShoppingBag,
} from "lucide-react";
import { TypingDots, ShimmerOrb } from "@/components/illustrations";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { usePatientContext, proxyUrl } from "@/hooks/use-patient-context";

interface ProductSuggestion {
  id: number;
  name: string;
  brand: string | null;
  category: string;
  price: string | null;
  imageUrl: string | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  products?: ProductSuggestion[];
}

interface PersistedMessage {
  id: number;
  userId: string;
  role: string;
  content: string;
  products?: ProductSuggestion[] | null;
  createdAt: string;
}

const quickTopicKeys = [
  { labelKey: "inquiry.drugInteractions", questionKey: "inquiry.drugInteractionsQ", icon: Shield, bg: "bg-primary/15", text: "text-primary" },
  { labelKey: "inquiry.sideEffects", questionKey: "inquiry.sideEffectsQ", icon: Pill, bg: "bg-orange-100/50 dark:bg-orange-900/20", text: "text-orange-600 dark:text-orange-400" },
  { labelKey: "inquiry.refillHelp", questionKey: "inquiry.refillHelpQ", icon: ShoppingCart, bg: "bg-blue-100/50 dark:bg-blue-900/20", text: "text-blue-600 dark:text-blue-400" },
  { labelKey: "nav.blisterPacks", questionKey: "inquiry.blisterPacksQ", icon: CalendarCheck, bg: "bg-green-100/50 dark:bg-green-900/20", text: "text-green-600 dark:text-green-400" },
  { labelKey: "inquiry.missedDose", questionKey: "inquiry.missedDoseQ", icon: HelpCircle, bg: "bg-orange-100/50 dark:bg-orange-900/20", text: "text-orange-600 dark:text-orange-400" },
  { labelKey: "inquiry.wellnessTips", questionKey: "inquiry.wellnessTipsQ", icon: Stethoscope, bg: "bg-primary/15", text: "text-primary" },
];

function formatMessage(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export default function Inquiry() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const hasPharmacyRecords = !!user && user.pharmacyAccess !== false;
  const [, setLocation] = useLocation();
  const { isProxy, activePatientId } = usePatientContext();
  const pUrl = (base: string) => proxyUrl(base, activePatientId, isProxy);
  const historyUrl = pUrl("/api/nutrition/history");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  const { data: savedHistory, isLoading: historyLoading } = useQuery<PersistedMessage[]>({
    queryKey: [historyUrl],
    enabled: hasPharmacyRecords,
  });

  useEffect(() => {
    if (savedHistory && !historyLoaded) {
      const restored: ChatMessage[] = savedHistory.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        products: m.products ?? undefined,
      }));
      setMessages(restored);
      setHistoryLoaded(true);
    }
  }, [savedHistory, historyLoaded]);

  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setMessages([]);
    setHistoryLoaded(false);
    setIsStreaming(false);
    stopSpeaking();
  }, [historyUrl]);

  const clearHistoryMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", pUrl("/api/nutrition/history")),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [historyUrl] });
      setMessages([]);
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    setInput("");
    setIsStreaming(true);
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;

    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setMessages([...updatedHistory, assistantMsg]);

    try {
      const response = await fetch(hasPharmacyRecords ? pUrl("/api/meds/inquiry") : "/api/meds/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          history: messages.slice(-10),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMsg = t("inquiry.errorMessage");
        try {
          const errData = await response.json();
          if (errData.error) errorMsg = errData.error;
        } catch {}
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: errorMsg };
          return copy;
        });
        setIsStreaming(false);
        return;
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";
      let completed = false;
      let streamError = false;

      while (true) {
        const { done, value } = await reader.read();
        if (controller.signal.aborted || requestRef.current !== controller) return;
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) {
              streamError = true;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: data.error };
                return copy;
              });
              continue;
            }
            if (data.content) {
              fullContent += data.content;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: fullContent };
                return copy;
              });
            }
            if (data.done && data.products?.length) {
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { ...copy[copy.length - 1], products: data.products };
                return copy;
              });
            }
            if (data.done) {
              completed = true;
              if (hasPharmacyRecords) queryClient.invalidateQueries({ queryKey: [historyUrl] });
            }
          } catch {
          }
        }
      }
      if (!completed && !streamError) throw new Error("Health Chat response was interrupted");
    } catch {
      if (controller.signal.aborted || requestRef.current !== controller) return;
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          content: t("inquiry.errorMessage"),
        };
        return copy;
      });
    }
    if (requestRef.current === controller) {
      requestRef.current = null;
      setIsStreaming(false);
    }
  };

  const handleSubmit = () => sendMessage(input);

  const clearChat = () => {
    if (isStreaming) return;
    clearHistoryMutation.mutate();
  };

  const showWelcome = messages.length === 0 && !historyLoading;

  return (
    <div className="flex flex-col h-full bg-background" data-testid="page-inquiry">
      <p role="note" className="px-4 py-2 text-sm border-b bg-muted/40 text-muted-foreground">
        {t("inquiry.aiNotice")}
      </p>
      {!hasPharmacyRecords && (
        <p role="status" className="px-4 py-2 text-sm bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          {t("inquiry.unlinkedNotice")}
        </p>
      )}
      {(messages.length > 0 || historyLoading) && (
        <div className="border-b px-4 py-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">{t("inquiry.healthAssistant")}</span>
          </div>
          {hasPharmacyRecords && messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearChat}
              disabled={isStreaming || clearHistoryMutation.isPending}
              data-testid="button-clear-chat"
            >
              {clearHistoryMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              {t("inquiry.clearChat")}
            </Button>
          )}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {historyLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground" data-testid="status-history-loading">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-base">Loading your chat history...</span>
          </div>
        )}

        {showWelcome && (
          <div className="max-w-2xl mx-auto space-y-8 py-6">
            <div className="text-center space-y-4 animate-drift-up">
              <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center" aria-hidden="true">
                <MessageCircle className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold animate-fade-in-1" data-testid="text-welcome-heading">
                {t("inquiry.welcomeHeading")}
              </h2>
              <p className="text-lg text-muted-foreground max-w-md mx-auto animate-fade-in-2">
                {t("inquiry.welcomeDescription")}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {quickTopicKeys.map((topic, i) => {
                const Icon = topic.icon;
                return (
                  <button
                    key={i}
                    onClick={() => sendMessage(t(topic.questionKey))}
                    disabled={isStreaming}
                    data-testid={`button-topic-${i}`}
                    className={`glass-card rounded-md p-4 text-left flex items-center gap-3 hover-elevate active-elevate-2 disabled:opacity-50 transition-opacity min-h-[60px] animate-drift-up-${Math.min(i + 1, 5)}`}
                  >
                    <div className={`h-10 w-10 rounded-md ${topic.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`h-5 w-5 ${topic.text}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-base">{t(topic.labelKey)}</p>
                      <p className="text-sm text-muted-foreground line-clamp-1">{t(topic.questionKey)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const isUser = msg.role === "user";
          const isLastAssistant = !isUser && i === messages.length - 1;
          const isThinking = isLastAssistant && isStreaming && !msg.content;
          const isActivelyStreaming = isLastAssistant && isStreaming && !!msg.content;

          return (
            <div
              key={i}
              className={`flex gap-3 max-w-2xl animate-message-bloom ${isUser ? "ml-auto flex-row-reverse" : "mr-auto"}`}
              data-testid={`chat-message-${i}`}
            >
              <Avatar className="h-9 w-9 shrink-0 mt-1">
                <AvatarFallback className={isUser ? "bg-primary text-primary-foreground text-sm" : "bg-primary/15 text-primary text-sm"}>
                  {isUser ? t("inquiry.you") : "CA"}
                </AvatarFallback>
              </Avatar>

              <div className={`space-y-2 max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
                {isThinking ? (
                  <div className="rounded-md px-4 py-3 glass-card rounded-bl-sm">
                    <ShimmerOrb />
                  </div>
                ) : (
                  <div className={`rounded-md px-4 py-3 ${isUser ? "bg-primary text-primary-foreground rounded-br-sm" : `glass-card rounded-bl-sm ${isActivelyStreaming ? "chat-streaming-shimmer" : ""}`}`}>
                    <CardContent className="p-0">
                      <p className={`text-base leading-relaxed whitespace-pre-wrap ${isActivelyStreaming ? "streaming-text" : ""}`}>
                        {msg.content ? formatMessage(msg.content) : null}
                      </p>
                      {isActivelyStreaming && (
                        <TypingDots className="mt-2" />
                      )}
                    </CardContent>
                  </div>
                )}
                {!isUser && msg.content && !isStreaming && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => speakText(msg.content)}
                    data-testid={`button-read-aloud-${i}`}
                    className="text-muted-foreground"
                  >
                    <Volume2 className="h-4 w-4 mr-1" />
                    {t("inquiry.readAloud")}
                  </Button>
                )}
                {!isUser && msg.products && msg.products.length > 0 && !isStreaming && (
                  <div className="w-full space-y-2" data-testid={`product-shelf-${i}`}>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                      <ShoppingBag className="h-3.5 w-3.5" />
                      Catalog matches (not medical recommendations)
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {msg.products.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setLocation(`/shop?highlight=${p.id}`)}
                          data-testid={`button-suggested-product-${p.id}`}
                          className="glass-card rounded-md p-2.5 flex-shrink-0 w-36 text-left hover-elevate active-elevate-2 transition-all"
                        >
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.name} className="w-full h-20 object-cover rounded mb-2" />
                          ) : (
                            <div className="w-full h-20 bg-primary/10 rounded mb-2 flex items-center justify-center">
                              <Pill className="h-7 w-7 text-primary/40" />
                            </div>
                          )}
                          <p className="text-xs font-semibold leading-tight line-clamp-2">{p.name}</p>
                          {p.brand && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{p.brand}</p>}
                          {p.price && <p className="text-xs font-bold text-primary mt-1">{p.price}</p>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t p-4 glass-card">
        <div className="max-w-2xl mx-auto flex gap-3 items-stretch flex-wrap">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={t("inquiry.inputPlaceholder")}
            className="flex-1 text-lg py-4 h-auto min-h-[56px] min-w-[200px]"
            disabled={isStreaming}
            data-testid="input-chat-message"
          />
          <VoiceButton
            onTranscript={(text) => { setInput(text); sendMessage(text); }}
            isProcessing={isStreaming}
            className="min-h-[56px]"
          />
          <Button
            onClick={handleSubmit}
            disabled={!input.trim() || isStreaming}
            size="lg"
            className="text-lg px-5"
            data-testid="button-send-message"
          >
            {isStreaming ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
