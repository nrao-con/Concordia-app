import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePatientContext, proxyUrl } from "@/hooks/use-patient-context";
import { getDateLocale } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Send, Building2, LogOut, Phone, Check, CheckCheck } from "lucide-react";
import { PharmacistAvatar, TypingDots } from "@/components/illustrations";
import type { PharmacyMessage } from "@shared/schema";
import { usePharmacyWS } from "@/hooks/use-pharmacy-ws";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

function formatRelativeTime(date: string | Date | null, locale: string, t: (key: string) => string) {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return "just_now";
  if (diffMins < 60) return `${diffMins} ${t("pharmacyChat.mAgo")}`;
  if (diffHours < 24) {
    return d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shouldShowDateDivider(current: PharmacyMessage, previous: PharmacyMessage | null) {
  if (!previous) return true;
  const currDate = new Date(current.createdAt || 0);
  const prevDate = new Date(previous.createdAt || 0);
  return currDate.toDateString() !== prevDate.toDateString();
}

function formatDateDivider(date: string | Date | null, locale: string, t: (key: string) => string) {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === now.toDateString()) return t("pharmacyChat.today");
  if (d.toDateString() === yesterday.toDateString()) return t("pharmacyChat.yesterday");
  return d.toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" });
}

export default function PharmacyChat() {
  const { t, i18n } = useTranslation();
  const dateLocale = getDateLocale(i18n.language);
  const search = useSearch();
  const [newMessage, setNewMessage] = useState(() => {
    const params = new URLSearchParams(search);
    return params.get("prefill") || "";
  });
  const [showEndDialog, setShowEndDialog] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { isProxy, activePatientId } = usePatientContext();
  const pUrl = (base: string) => proxyUrl(base, activePatientId, isProxy);
  const msgKey = [pUrl("/api/pharmacy-messages")];

  const { sendMessage } = usePharmacyWS(msgKey);

  const { data: messages, isLoading } = useQuery<PharmacyMessage[]>({
    queryKey: msgKey,
    refetchInterval: 5_000,
  });

  const chronologicalMessages = messages ? [...messages].reverse() : [];

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", pUrl(`/api/pharmacy-messages/${id}/read`));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: msgKey });
    },
  });

  const endChatMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", pUrl("/api/pharmacy-messages"), {
        message: "Thank you for your help. Have a great day!",
        category: "general",
        relatedOrderId: null,
      });
      await apiRequest("DELETE", pUrl("/api/pharmacy-messages"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: msgKey });
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/pharmacy-messages/unread-count")] });
      setShowEndDialog(false);
      toast({
        title: t("pharmacyChat.chatEnded"),
        description: t("pharmacyChat.chatEndedDesc"),
      });
      setTimeout(() => { window.location.href = "/"; }, 1500);
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message || t("pharmacyChat.failedToSend"),
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (chronologicalMessages.length > 0) {
      const unread = chronologicalMessages.filter(
        (m) => m.direction === "inbound" && !m.isRead
      );
      unread.forEach((m) => markReadMutation.mutate(m.id));
    }
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chronologicalMessages.length]);

  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    const trimmed = newMessage.trim();
    if (!trimmed || isSending) return;
    setNewMessage("");
    setIsSending(true);
    try {
      await sendMessage({ message: trimmed });
    } catch (error) {
      toast({
        title: t("pharmacyChat.failedToSend"),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
      setNewMessage(trimmed);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full" data-testid="page-pharmacy-chat">
      <div className="p-4 border-b glass-card flex items-center gap-3 flex-wrap">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback className="bg-primary/15 text-primary text-sm font-bold">
            <Building2 className="h-5 w-5" />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold" data-testid="text-chat-title">
            {t("pharmacyChat.title")}
          </h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            Pharmacy messaging
          </p>
        </div>
        {chronologicalMessages.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowEndDialog(true)}
            disabled={endChatMutation.isPending}
            className="shrink-0"
            data-testid="button-end-chat"
          >
            <LogOut className="h-4 w-4 mr-1.5" />
            {t("pharmacyChat.endChat")}
          </Button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-1"
        data-testid="container-messages"
      >
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}
              >
                <Skeleton className="h-16 w-3/4 rounded-md" />
              </div>
            ))}
          </div>
        ) : chronologicalMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-12 animate-fade-in">
            <PharmacistAvatar className="w-24 h-24" />
            <div className="space-y-2">
              <p className="text-xl font-semibold" data-testid="text-empty-state">
                {t("pharmacyChat.startConversation")}
              </p>
              <p className="text-base text-muted-foreground max-w-xs mx-auto">
                {t("pharmacyChat.startConversationDesc")}
              </p>
            </div>
          </div>
        ) : (
          chronologicalMessages.map((msg, idx) => {
            const isOutbound = msg.direction === "outbound";
            const prevMsg = idx > 0 ? chronologicalMessages[idx - 1] : null;
            const showDivider = shouldShowDateDivider(msg, prevMsg);
            const isConsecutiveSameDir = prevMsg && prevMsg.direction === msg.direction;

            return (
              <div key={msg.id}>
                {showDivider && (
                  <div className="flex items-center gap-3 py-3" data-testid={`divider-date-${msg.id}`}>
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs font-medium text-muted-foreground px-2">
                      {formatDateDivider(msg.createdAt, dateLocale, t)}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
                <div
                  className={`flex gap-2 ${isOutbound ? "justify-end" : "justify-start"} ${isConsecutiveSameDir ? "mt-1" : "mt-3"}`}
                  data-testid={`message-${msg.id}`}
                >
                  {!isOutbound && (
                    <Avatar className={`h-8 w-8 shrink-0 mt-1 ${isConsecutiveSameDir ? "invisible" : ""}`}>
                      <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                        Rx
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className={`max-w-[75%] ${isOutbound ? "items-end" : "items-start"}`}>
                    <div
                      className={`px-4 py-2.5 rounded-md animate-message-in ${
                        isOutbound
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "glass-card rounded-bl-sm"
                      }`}
                    >
                      <p
                        className="text-base leading-relaxed"
                        data-testid={`text-message-${msg.id}`}
                      >
                        {msg.message}
                      </p>
                    </div>
                    <div className={`flex items-center gap-1.5 mt-1 ${isOutbound ? "justify-end" : "justify-start"}`}>
                      <span
                        className="text-xs text-muted-foreground"
                        data-testid={`text-time-${msg.id}`}
                      >
                        {(() => {
                          const timeVal = formatRelativeTime(msg.createdAt, dateLocale, t);
                          if (timeVal === "just_now") return t("pharmacyChat.justNow");
                          return timeVal;
                        })()}
                      </span>
                      {isOutbound && (
                        <DeliveryReceipt status={(msg as PharmacyMessage & {
                          deliveryStatus?: "sent" | "received" | "read" | null;
                        }).deliveryStatus ?? null} />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        {isSending && (
          <div className="flex justify-start gap-2 mt-3" data-testid="typing-indicator">
            <Avatar className="h-8 w-8 shrink-0 mt-1">
              <AvatarFallback className="bg-primary/15 text-primary text-xs font-bold">
                Rx
              </AvatarFallback>
            </Avatar>
            <div className="glass-card px-4 py-3 rounded-md rounded-bl-sm">
              <TypingDots />
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t glass-card">
        <div
          className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
          aria-label="Message delivery status legend"
          data-testid="delivery-status-legend"
        >
          <span className="font-medium">Delivery status</span>
          <span className="inline-flex items-center gap-1">
            <Check aria-hidden="true" className="h-3.5 w-3.5" />
            Sent
          </span>
          <span className="inline-flex items-center gap-1">
            <CheckCheck aria-hidden="true" className="h-3.5 w-3.5" />
            Received
          </span>
          <span className="inline-flex items-center gap-1">
            <CheckCheck aria-hidden="true" className="h-3.5 w-3.5 text-red-600" />
            Read
          </span>
          <span>Unconfirmed</span>
        </div>
        <div className="flex gap-2 items-stretch">
          <Input
            placeholder={t("pharmacyChat.typePlaceholder")}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 text-lg min-h-[48px]"
            style={{ fontSize: "18px" }}
            disabled={isSending}
            data-testid="input-message"
          />
          <Button
            type="button"
            size="lg"
            onClick={handleSend}
            disabled={!newMessage.trim() || isSending}
            className="min-h-[48px] min-w-[48px]"
            data-testid="button-send"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <Dialog open={showEndDialog} onOpenChange={(open) => {
        if (!endChatMutation.isPending) setShowEndDialog(open);
      }}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle className="text-xl" data-testid="text-end-chat-title">{t("pharmacyChat.endChatConfirm")}</DialogTitle>
            <DialogDescription className="text-base">
              {t("pharmacyChat.endChatDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="rounded-md bg-muted/50 p-4 space-y-2">
              <p className="text-base font-medium">{t("pharmacyChat.needMoreHelp")}</p>
              <a
                href="tel:7183282833"
                className="flex items-center gap-3 text-base text-primary font-medium"
                data-testid="link-call-pharmacy"
              >
                <Phone className="h-5 w-5" />
                {t("pharmacyChat.callPharmacyNumber")}
              </a>
              <p className="text-sm text-muted-foreground">{t("pharmacyChat.pharmacyHours")}</p>
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setShowEndDialog(false)}
                disabled={endChatMutation.isPending}
                data-testid="button-continue-chat"
              >
                {t("pharmacyChat.continueChat")}
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={() => endChatMutation.mutate()}
                disabled={endChatMutation.isPending}
                data-testid="button-confirm-end-chat"
              >
                {endChatMutation.isPending ? t("common.loading") : t("pharmacyChat.endChat")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function DeliveryReceipt({ status }: { status: "sent" | "received" | "read" | null }) {
  if (status === null) {
    return (
      <span
        className="text-xs text-muted-foreground"
        title="Delivery unconfirmed"
        aria-label="Delivery unconfirmed"
        data-testid="delivery-unconfirmed"
      >
        Delivery unconfirmed
      </span>
    );
  }

  const labels = {
    sent: "Sent",
    received: "Received",
    read: "Read",
  };

  return (
    <span
      className={status === "read" ? "text-red-600" : "text-muted-foreground"}
      title={labels[status]}
      aria-label={labels[status]}
      data-testid={`delivery-${status}`}
    >
      {status === "sent" ? (
        <Check aria-hidden="true" className="h-3.5 w-3.5" />
      ) : (
        <CheckCheck aria-hidden="true" className="h-3.5 w-3.5" />
      )}
    </span>
  );
}