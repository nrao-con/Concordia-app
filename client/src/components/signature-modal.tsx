import { useRef, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import SignaturePad from "signature_pad";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, RotateCcw, Check, ChevronRight } from "lucide-react";

export interface SignatureConfirmData {
  signatureData: string;
  recipientName?: string;
  recipientRelationship?: string;
}

interface ApprovedCaregiver {
  caregiverId: string;
  caregiverName: string;
  relationship: string;
}

interface SignatureModalProps {
  onConfirm: (data: SignatureConfirmData) => void;
  onCancel: () => void;
  isPending?: boolean;
  isDelivery?: boolean;
  patientName?: string;
}

const RELATIONSHIP_OPTIONS = [
  { value: "Patient", label: "Patient (myself)" },
  { value: "Caregiver", label: "Caregiver" },
  { value: "Family Member", label: "Family Member" },
  { value: "Other", label: "Other" },
];

export function SignatureModal({ onConfirm, onCancel, isPending, isDelivery, patientName }: SignatureModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [step, setStep] = useState<"recipient" | "signature">(isDelivery ? "recipient" : "signature");
  const [recipientName, setRecipientName] = useState(patientName || "");
  const [recipientRelationship, setRecipientRelationship] = useState("Patient");

  const { data: caregivers = [] } = useQuery<ApprovedCaregiver[]>({
    queryKey: ["/api/patient/caregivers"],
    enabled: !!isDelivery,
  });

  useEffect(() => {
    if (step !== "signature") return;
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(ratio, ratio);
    }

    padRef.current = new SignaturePad(canvas, {
      backgroundColor: "rgb(255, 255, 255)",
      penColor: "rgb(0, 0, 0)",
      minWidth: 1.5,
      maxWidth: 3,
    });

    padRef.current.addEventListener("endStroke", () => {
      setIsEmpty(padRef.current?.isEmpty() ?? true);
    });

    return () => {
      padRef.current?.off();
    };
  }, [step]);

  const handleClear = () => {
    padRef.current?.clear();
    setIsEmpty(true);
  };

  const handleConfirm = () => {
    if (!padRef.current || padRef.current.isEmpty()) return;
    const dataUrl = padRef.current.toDataURL("image/png");
    onConfirm({
      signatureData: dataUrl,
      recipientName: isDelivery ? recipientName.trim() || patientName : undefined,
      recipientRelationship: isDelivery ? recipientRelationship : undefined,
    });
  };

  const handleCaregiverSelect = (cg: ApprovedCaregiver) => {
    setRecipientName(cg.caregiverName);
    setRecipientRelationship("Caregiver");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      data-testid="modal-signature"
    >
      <Card className="w-full max-w-md">
        <CardContent className="p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-xl font-bold">
              {isDelivery
                ? step === "recipient"
                  ? "Who Received This Package?"
                  : "Sign to Confirm Delivery"
                : "Sign to Confirm Receipt"}
            </h2>
            <Button
              size="icon"
              variant="ghost"
              onClick={onCancel}
              disabled={isPending}
              data-testid="button-close-signature"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {isDelivery && step === "recipient" && (
            <div className="flex flex-col gap-4">
              <p className="text-base text-muted-foreground">
                Please confirm who received this delivery. This is required for pharmacy compliance records.
              </p>

              {caregivers.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium text-muted-foreground">Quick select a linked caregiver:</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={recipientName === (patientName || "") && recipientRelationship === "Patient" ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setRecipientName(patientName || ""); setRecipientRelationship("Patient"); }}
                      data-testid="button-select-patient-self"
                    >
                      {patientName || "Myself"}
                    </Button>
                    {caregivers.map((cg) => (
                      <Button
                        key={cg.caregiverId}
                        type="button"
                        variant={recipientName === cg.caregiverName ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleCaregiverSelect(cg)}
                        data-testid={`button-select-caregiver-${cg.caregiverId}`}
                      >
                        {cg.caregiverName}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="recipient-name" className="text-base font-medium">
                  Full name of person who received the package
                </Label>
                <Input
                  id="recipient-name"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Full name"
                  className="text-base h-12"
                  data-testid="input-recipient-name"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="recipient-relationship" className="text-base font-medium">
                  Relationship to patient
                </Label>
                <Select
                  value={recipientRelationship}
                  onValueChange={setRecipientRelationship}
                >
                  <SelectTrigger
                    id="recipient-relationship"
                    className="h-12 text-base"
                    data-testid="select-recipient-relationship"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} data-testid={`option-relationship-${opt.value.toLowerCase().replace(/\s+/g, "-")}`}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                size="lg"
                className="w-full text-lg mt-2"
                onClick={() => setStep("signature")}
                disabled={!recipientName.trim()}
                data-testid="button-next-to-signature"
              >
                Next: Sign
                <ChevronRight className="h-5 w-5 ml-2" />
              </Button>
            </div>
          )}

          {step === "signature" && (
            <>
              {isDelivery && (
                <div className="rounded-md bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  Confirming receipt for: <span className="font-semibold text-foreground">{recipientName || patientName}</span>
                  {" "}&bull;{" "}
                  <span className="italic">{recipientRelationship}</span>
                </div>
              )}

              {!isDelivery && (
                <p className="text-base text-muted-foreground">
                  Please sign below to confirm you have received your package
                </p>
              )}

              <div
                className="border-2 border-dashed border-border rounded-md overflow-hidden bg-white"
                data-testid="signature-canvas-container"
              >
                <canvas
                  ref={canvasRef}
                  className="w-full touch-none"
                  style={{ height: "160px" }}
                  data-testid="canvas-signature"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleClear}
                  disabled={isPending}
                  className="flex-1"
                  data-testid="button-clear-signature"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Clear
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={isEmpty || isPending}
                  className="flex-1"
                  data-testid="button-confirm-signature"
                >
                  {isPending ? (
                    "Confirming..."
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Confirm Receipt
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
