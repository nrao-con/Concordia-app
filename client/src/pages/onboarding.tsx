import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import concordiaLogo from "@assets/concordia_logo_trimmed.png";
import { useMutation } from "@tanstack/react-query";
import { apiErrorMessage, apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressFields } from "@/components/address-fields";
import { Checkbox } from "@/components/ui/checkbox";
import {
  User,
  Users,
  Heart,
  ArrowLeft,
  ArrowRight,
  Camera,
  Upload,
  Phone,
  Calendar,
  MapPin,
  CreditCard,
  IdCard,
  FileText,
  Check,
  ShieldCheck,
} from "lucide-react";

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-3" data-testid="progress-dots">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-2.5 rounded-full transition-all duration-300 ${
            i === current
              ? "w-8 bg-primary"
              : i < current
                ? "w-2.5 bg-muted-foreground/30"
                : "w-2.5 bg-muted"
          }`}
          data-testid={`dot-step-${i}`}
        />
      ))}
    </div>
  );
}

function TermsConsent({ onAgree }: { onAgree: () => void }) {
  const { t } = useTranslation();
  const [agreed, setAgreed] = useState(false);

  const sections = [
    { heading: t("onboarding.termsHeading1"), body: t("onboarding.termsBody1") },
    { heading: t("onboarding.termsHeading2"), body: t("onboarding.termsBody2") },
    { heading: t("onboarding.termsHeading3"), body: t("onboarding.termsBody3") },
    { heading: t("onboarding.termsHeading4"), body: t("onboarding.termsBody4") },
  ];

  return (
    <div className="flex flex-col min-h-full px-5 py-6 space-y-6">
      <div className="text-center space-y-3 animate-drift-up">
        <div className="w-16 h-16 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto">
          <ShieldCheck className="w-9 h-9 text-slate-600 dark:text-slate-300" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-terms-title">
          {t("onboarding.termsTitle")}
        </h1>
        <p className="text-base text-muted-foreground leading-relaxed max-w-sm mx-auto">
          {t("onboarding.termsSubtitle")}
        </p>
      </div>

      <div
        className="flex-1 overflow-y-auto rounded-lg border bg-muted/30 p-5 space-y-5 max-h-[42vh]"
        data-testid="scroll-terms-content"
      >
        {sections.map((section, i) => (
          <div key={i} className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">{section.heading}</h2>
            <p className="text-base text-muted-foreground leading-relaxed">{section.body}</p>
          </div>
        ))}
      </div>

      <div
        className="flex items-start gap-4 p-4 rounded-lg border bg-background"
        data-testid="container-terms-checkbox"
      >
        <Checkbox
          id="terms-agree"
          checked={agreed}
          onCheckedChange={(val) => setAgreed(!!val)}
          className="mt-0.5 h-6 w-6 shrink-0"
          data-testid="checkbox-terms-agree"
        />
        <label
          htmlFor="terms-agree"
          className="flex-1 min-h-6 text-base leading-snug cursor-pointer select-none"
        >
          {t("onboarding.termsCheckbox")}
        </label>
      </div>

      <div className="pb-4">
        <Button
          size="lg"
          className="w-full text-xl py-6"
          disabled={!agreed}
          onClick={onAgree}
          data-testid="button-terms-agree"
        >
          <ShieldCheck className="h-5 w-5 mr-2" />
          {t("onboarding.termsAgree")}
        </Button>
      </div>
    </div>
  );
}

function RoleSelection({ onSelect }: { onSelect: (role: string) => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selecting, setSelecting] = useState<string | null>(null);

  const roleMutation = useMutation({
    mutationFn: async (role: string) => {
      const res = await apiRequest("POST", "/api/onboarding/role", { role });
      return res.json();
    },
    onSuccess: (_, role) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      onSelect(role);
    },
    onError: (error: Error) => {
      setSelecting(null);
      toast({
        title: t("common.error"),
        description: error.message || "Unable to save your selection. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSelect = (role: string, displayRole: string) => {
    setSelecting(displayRole);
    roleMutation.mutate(role);
  };

  const roles = [
    {
      displayRole: "patient",
      apiRole: "patient",
      icon: User,
      title: t("onboarding.iAmPatient"),
      description: t("onboarding.patientDescription"),
      iconBg: "bg-slate-100 dark:bg-slate-800",
      iconColor: "text-primary",
    },
    {
      displayRole: "caregiver",
      apiRole: "caregiver",
      icon: Heart,
      title: t("onboarding.iAmCaregiver"),
      description: t("onboarding.caregiverDescription"),
      iconBg: "bg-emerald-100/60 dark:bg-emerald-900/20",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      displayRole: "family",
      apiRole: "caregiver",
      icon: Users,
      title: t("onboarding.iAmFamilyMember"),
      description: t("onboarding.familyMemberDescription"),
      iconBg: "bg-orange-100/50 dark:bg-orange-900/20",
      iconColor: "text-orange-600 dark:text-orange-400",
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-5 py-8 space-y-8">
      <div className="text-center space-y-3 animate-drift-up">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-role-title">
          {t("onboarding.tellUsAboutYourself")}
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed max-w-sm mx-auto">
          {t("onboarding.personalizeExperience")}
        </p>
      </div>

      <div className="w-full max-w-md space-y-4">
        {roles.map((role, index) => (
          <Card
            key={role.displayRole}
            className={`hover-elevate cursor-pointer transition-all duration-200 ${
              selecting === role.displayRole ? "ring-2 ring-primary" : ""
            }`}
            style={{
              animation: `drift-up 0.45s cubic-bezier(0.4, 0.0, 0.2, 1) ${0.1 + index * 0.08}s both`,
            }}
            onClick={() => {
              if (!roleMutation.isPending) {
                handleSelect(role.apiRole, role.displayRole);
              }
            }}
            role="button"
            tabIndex={roleMutation.isPending ? -1 : 0}
            aria-disabled={roleMutation.isPending}
            onKeyDown={(event) => {
              if (!roleMutation.isPending && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                handleSelect(role.apiRole, role.displayRole);
              }
            }}
            data-testid={`card-role-${role.displayRole}`}
          >
            <CardContent className="flex items-center gap-4 p-5">
              <div
                className={`w-14 h-14 rounded-lg ${role.iconBg} flex items-center justify-center shrink-0`}
              >
                <role.icon className={`w-7 h-7 ${role.iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xl font-semibold" data-testid={`text-role-${role.displayRole}`}>
                  {role.title}
                </p>
                <p className="text-base text-muted-foreground leading-snug">
                  {role.description}
                </p>
              </div>
              {selecting === role.displayRole && roleMutation.isPending && (
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ProfileCompletion({
  onComplete,
  onBack,
}: {
  onComplete: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState("");
  const [uploadedDocs, setUploadedDocs] = useState<
    { type: string; label: string }[]
  >([]);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    dateOfBirth: "",
    deliveryAddress: "",
  });

  useEffect(() => {
    if (user) {
      setFormData({
        firstName: (user as any).firstName || "",
        lastName: (user as any).lastName || "",
        phone: (user as any).phone || "",
        dateOfBirth: (user as any).dateOfBirth || "",
        deliveryAddress: (user as any).deliveryAddress || "",
      });
    }
  }, [user]);

  const profileMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("PATCH", "/api/profile", data);
      return res.json();
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/profile"] }),
      ]);
      onComplete();
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: apiErrorMessage(error, t("onboarding.errorSavingProfile")),
        variant: "destructive",
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (doc: {
      type: string;
      label: string;
      imageData: string;
    }) => {
      const res = await apiRequest("POST", "/api/documents", doc);
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setUploadedDocs((prev) => [
        ...prev,
        { type: variables.type, label: variables.label },
      ]);
      toast({
        title: t("onboarding.documentUploaded"),
        description: t("onboarding.documentUploadedDesc"),
      });
      setUploadType("");
    },
    onError: () => {
      toast({
        title: t("onboarding.uploadFailed"),
        description: t("onboarding.uploadFailedDesc"),
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (uploadMutation.isPending) return;
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t("onboarding.fileTooLarge"),
        description: t("onboarding.fileTooLargeDesc"),
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (uploadMutation.isPending) return;
      const imageData = reader.result as string;
      const docTypes: Record<string, string> = {
        insurance_card: t("onboarding.insuranceCard"),
        government_id: t("onboarding.governmentId"),
        prescription: t("onboarding.prescription"),
      };
      uploadMutation.mutate({
        type: uploadType,
        label: docTypes[uploadType] || "Document",
        imageData,
      });
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleChange = (key: string, value: string) => {
    if (key === "phone") {
      value = value.replace(/\D/g, "").slice(0, 10);
    } else if (key === "firstName" || key === "lastName") {
      value = value.replace(/[^a-zA-Z\s]/g, "");
    }
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = () => {
    if (profileMutation.isPending) return;
    if (!formData.firstName.trim()) {
      toast({
        title: t("onboarding.firstNameRequired"),
        description: t("onboarding.firstNameRequiredDesc"),
        variant: "destructive",
      });
      return;
    }
    if (!formData.lastName.trim() || formData.phone.length !== 10 || !formData.dateOfBirth) {
      toast({
        title: t("common.error"),
        description: "Please enter your last name, a 10-digit phone number, and your date of birth before continuing.",
        variant: "destructive",
      });
      return;
    }
    profileMutation.mutate(formData);
  };

  const docTypeOptions = [
    { value: "insurance_card", label: t("onboarding.insuranceCard"), icon: CreditCard },
    { value: "government_id", label: t("onboarding.governmentId"), icon: IdCard },
    { value: "prescription", label: t("onboarding.prescription"), icon: FileText },
  ];

  return (
    <div className="flex flex-col min-h-full px-5 py-6 space-y-6 overflow-y-auto">
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          variant="ghost"
          type="button"
          onClick={onBack}
          disabled={profileMutation.isPending}
          data-testid="button-back-to-role"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-profile-title">
            {t("onboarding.completeYourProfile")}
          </h1>
          <p className="text-base text-muted-foreground">
            {t("onboarding.helpUsServeYou")}
          </p>
        </div>
      </div>

      <div className="space-y-5 animate-drift-up">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-base font-medium text-muted-foreground flex items-center gap-2">
              <User className="h-4 w-4" />
              {t("onboarding.firstName")}
            </label>
            <Input
              type="text"
              value={formData.firstName}
              onChange={(e) => handleChange("firstName", e.target.value)}
              placeholder={t("onboarding.firstName")}
              className="text-lg min-h-[52px]"
              disabled={profileMutation.isPending}
              data-testid="input-onboarding-firstName"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-base font-medium text-muted-foreground flex items-center gap-2">
              <User className="h-4 w-4" />
              {t("onboarding.lastName")}
            </label>
            <Input
              type="text"
              value={formData.lastName}
              onChange={(e) => handleChange("lastName", e.target.value)}
              placeholder={t("onboarding.lastName")}
              className="text-lg min-h-[52px]"
              disabled={profileMutation.isPending}
              data-testid="input-onboarding-lastName"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-base font-medium text-muted-foreground flex items-center gap-2">
            <Phone className="h-4 w-4" />
            {t("onboarding.phoneNumber")}
          </label>
          <Input
            type="tel"
            value={formData.phone.length >= 7 ? `${formData.phone.slice(0,3)}-${formData.phone.slice(3,6)}-${formData.phone.slice(6,10)}` : formData.phone.length >= 4 ? `${formData.phone.slice(0,3)}-${formData.phone.slice(3)}` : formData.phone}
            onChange={(e) => handleChange("phone", e.target.value)}
            placeholder="718-000-0000"
            maxLength={12}
            className="text-lg min-h-[52px]"
              disabled={profileMutation.isPending}
            data-testid="input-onboarding-phone"
          />
          {formData.phone && formData.phone.length > 0 && (
            <span
              className={`text-sm ${formData.phone.length === 10 ? "text-muted-foreground" : "text-destructive"}`}
              data-testid="hint-onboarding-phone"
            >
              {t("onboarding.phoneDigitsHint")} ({formData.phone.length}/10)
            </span>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-base font-medium text-muted-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {t("onboarding.dateOfBirth")}
          </label>
          <Input
            type="date"
            value={formData.dateOfBirth}
            onChange={(e) => handleChange("dateOfBirth", e.target.value)}
            className="text-lg min-h-[52px]"
            disabled={profileMutation.isPending}
            data-testid="input-onboarding-dateOfBirth"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-base font-medium text-muted-foreground flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            {t("onboarding.deliveryAddress")}
          </label>
          <AddressFields
            value={formData.deliveryAddress}
            onChange={(val) => setFormData((prev) => ({ ...prev, deliveryAddress: val }))}
            disabled={profileMutation.isPending}
          />
        </div>

        <div className="space-y-3">
          <p className="text-base font-medium text-muted-foreground">
            {t("onboarding.uploadDocuments")}
          </p>
          <div className="flex gap-3 flex-wrap">
            {docTypeOptions.map((opt) => {
              const isUploaded = uploadedDocs.some(
                (d) => d.type === opt.value
              );
              return (
                <Button
                  key={opt.value}
                  variant={
                    isUploaded
                      ? "default"
                      : uploadType === opt.value
                        ? "default"
                        : "outline"
                  }
                  size="lg"
                  type="button"
                  className="text-base flex-1 min-w-[100px]"
                  onClick={() => {
                    if (!isUploaded) setUploadType(opt.value);
                  }}
                  disabled={isUploaded || uploadMutation.isPending || profileMutation.isPending}
                  data-testid={`button-onboarding-doctype-${opt.value}`}
                >
                  {isUploaded ? (
                    <Check className="h-5 w-5 mr-1" />
                  ) : (
                    <opt.icon className="h-5 w-5 mr-1" />
                  )}
                  {opt.label}
                </Button>
              );
            })}
          </div>

          {uploadType && (
            <div className="flex gap-3 animate-drift-up">
              <Button
                size="lg"
                variant="outline"
                type="button"
                className="flex-1 text-base"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending || profileMutation.isPending}
                data-testid="button-onboarding-upload-file"
              >
                <Upload className="h-5 w-5 mr-2" />
                {uploadMutation.isPending ? t("common.uploading") : t("onboarding.chooseFile")}
              </Button>
              <Button
                size="lg"
                variant="outline"
                type="button"
                className="flex-1 text-base"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.setAttribute(
                      "capture",
                      "environment"
                    );
                    fileInputRef.current.click();
                    fileInputRef.current.removeAttribute("capture");
                  }
                }}
                disabled={uploadMutation.isPending || profileMutation.isPending}
                data-testid="button-onboarding-camera"
              >
                <Camera className="h-5 w-5 mr-2" />
                {t("onboarding.takePhoto")}
              </Button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
            data-testid="input-onboarding-file"
          />
        </div>
      </div>

      <div className="pt-4 pb-4">
        <Button
          size="lg"
          type="button"
          className="w-full text-xl py-6"
          onClick={handleSubmit}
          disabled={profileMutation.isPending}
          data-testid="button-onboarding-save-profile"
        >
          {profileMutation.isPending ? (
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              {t("common.saving")}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {t("onboarding.continue")}
              <ArrowRight className="h-5 w-5" />
            </div>
          )}
        </Button>
      </div>
    </div>
  );
}

function WelcomeAnimation({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [animating, setAnimating] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submissionStartedRef = useRef(false);

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/onboarding/complete", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      onComplete();
    },
    onError: (error: Error) => {
      submissionStartedRef.current = false;
      setAnimating(false);
      toast({
        title: t("common.error"),
        description: error.message || "Unable to finish setup. Tap to try again.",
        variant: "destructive",
      });
    },
  });

  const submitCompletion = () => {
    if (submissionStartedRef.current) return;
    submissionStartedRef.current = true;
    setAnimating(false);
    completeMutation.mutate();
  };

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      submitCompletion();
    }, 3500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleTap = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    submitCompletion();
  };

  return (
    <div
      className="flex flex-col items-center justify-center min-h-full px-6 cursor-pointer"
      onClick={handleTap}
      role="button"
      tabIndex={0}
      aria-disabled={completeMutation.isPending}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleTap();
        }
      }}
      data-testid="container-welcome"
    >
      <div className="text-center space-y-8">
        <div
          className="flex items-center justify-center mx-auto"
          style={{
            animation: "welcome-icon-spring 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both",
          }}
        >
          <img
            src={concordiaLogo}
            alt="ConcordiaCare"
            className="h-24 w-auto object-contain"
            onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
            data-testid="img-logo-welcome"
          />
          <div className="w-24 h-24 rounded-lg bg-primary/10 flex items-center justify-center hidden">
            <Heart
              className="w-12 h-12 text-primary"
              style={{
                animation: "welcome-icon-spring 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.4s both",
              }}
            />
          </div>
        </div>

        <div className="space-y-4">
          <h1
            className="text-4xl font-bold tracking-tight"
            style={{
              animation: "welcome-text-spring 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.5s both",
            }}
            data-testid="text-welcome-title"
          >
            {t("onboarding.welcomeToConcordia")}
          </h1>
          <p
            className="text-xl text-muted-foreground leading-relaxed"
            style={{
              animation: "welcome-text-spring 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.7s both",
            }}
            data-testid="text-welcome-subtitle"
          >
            {t("onboarding.weWillTakeCare")}
          </p>
        </div>

        {!animating && (
          <p
            className="text-base text-muted-foreground animate-fade-in"
            data-testid="text-welcome-tap"
          >
            {completeMutation.isPending ? t("onboarding.settingUpAccount") : t("onboarding.tapToContinue")}
          </p>
        )}
      </div>

      <style>{`
        @keyframes welcome-icon-spring {
          0% {
            opacity: 0;
            transform: scale(0.3) translateY(30px);
          }
          50% {
            opacity: 1;
            transform: scale(1.1) translateY(-5px);
          }
          70% {
            transform: scale(0.95) translateY(2px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes welcome-text-spring {
          0% {
            opacity: 0;
            transform: translateY(24px);
          }
          60% {
            opacity: 1;
            transform: translateY(-3px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

export default function Onboarding() {
  const [step, setStep] = useState(0);

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <div className="pt-6 pb-4 px-5">
        <ProgressDots current={step} total={4} />
      </div>
      <div className="flex-1 flex flex-col">
        {step === 0 && (
          <TermsConsent onAgree={() => setStep(1)} />
        )}
        {step === 1 && (
          <RoleSelection onSelect={() => setStep(2)} />
        )}
        {step === 2 && (
          <ProfileCompletion
            onComplete={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <WelcomeAnimation
            onComplete={() => {
              window.location.href = "/";
            }}
          />
        )}
      </div>
    </div>
  );
}
