import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2 } from "lucide-react";

interface VoiceButtonProps {
  onTranscript: (text: string) => void;
  isProcessing?: boolean;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
}

export function VoiceButton({ onTranscript, isProcessing, className = "", size = "lg" }: VoiceButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onTranscript(transcript);
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [onTranscript]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, []);

  const handleClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  if (isProcessing) {
    return (
      <Button size={size} variant="outline" disabled className={className} data-testid="button-voice-processing">
        <Loader2 className="w-5 h-5 animate-spin" />
        {size !== "icon" && <span className="text-lg">Processing...</span>}
      </Button>
    );
  }

  return (
    <Button
      size={size}
      variant={isListening ? "destructive" : "default"}
      onClick={handleClick}
      className={className}
      data-testid="button-voice"
    >
      {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      {size !== "icon" && (
        <span className="text-lg">{isListening ? "Stop" : "Speak"}</span>
      )}
    </Button>
  );
}

export function speakText(text: string) {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.85;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  }
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
