import { useState, useRef } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiErrorMessage, apiRequest, queryClient } from "@/lib/queryClient";
import { usePatientContext, proxyUrl } from "@/hooks/use-patient-context";
import { getDateLocale } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/hooks/use-theme";
import { MemberCard } from "@/components/member-card";
import { useTranslation } from "react-i18next";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  User,
  Phone,
  Calendar,
  Edit3,
  Save,
  X,
  AlertTriangle,
  MapPin,
  FileText,
  Camera,
  Upload,
  Trash2,
  CreditCard,
  IdCard,
  Plus,
  Shield,
  Truck,
  Stethoscope,
  Navigation,
  Users,
  UserPlus,
  Clock,
  CheckCircle2,
  Globe,
  Moon,
  Sun,
  LogOut,
  Settings,
  Star,
  TrendingUp,
  Award,
  Flame,
  Bell,
} from "lucide-react";
import type { User as AppUser, UserDocument, Medication, PatientDoctor, PointsTransaction, EarningRule } from "@shared/schema";
import { POINTS_PER_DOLLAR } from "@shared/schema";


function ProfileInfoSection({
  user,
  isEditing,
  formData,
  setFormData,
}: {
  user: any;
  isEditing: boolean;
  formData: any;
  setFormData: (data: any) => void;
}) {
  const { t, i18n } = useTranslation();

  const fields = [
    { key: "firstName", label: t("profile.firstName"), icon: User, type: "text" },
    { key: "lastName", label: t("profile.lastName"), icon: User, type: "text" },
    { key: "phone", label: t("profile.phoneNumber"), icon: Phone, type: "tel" },
    { key: "dateOfBirth", label: t("profile.dateOfBirth"), icon: Calendar, type: "date" },
  ];

  const formatDOB = (val: string | null) => {
    if (!val) return t("common.notSet");
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return d.toLocaleDateString(getDateLocale(i18n.language), { year: "numeric", month: "long", day: "numeric" });
  };

  return (
    <Card data-testid="card-profile-info" className="animate-drift-up-3">
      <CardHeader className="flex flex-row items-center gap-2">
        <div className="h-9 w-9 rounded-md bg-blue-100/50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
          <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <CardTitle className="text-xl">{t("profile.patientInformation")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {fields.map((field) => {
            const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
              let value = e.target.value;
              if (field.key === "phone") {
                value = value.replace(/\D/g, "").slice(0, 10);
              } else if (field.key === "firstName" || field.key === "lastName") {
                value = value.replace(/[^a-zA-Z\s]/g, "");
              }
              setFormData({ ...formData, [field.key]: value });
            };

            const formatPhoneDisplay = (raw: string) => {
              if (raw.length >= 7) return `${raw.slice(0,3)}-${raw.slice(3,6)}-${raw.slice(6,10)}`;
              if (raw.length >= 4) return `${raw.slice(0,3)}-${raw.slice(3)}`;
              return raw;
            };

            const getValidationHint = () => {
              if (!isEditing) return null;
              if (field.key === "phone" && formData[field.key] && formData[field.key].length > 0) {
                const len = formData[field.key].length;
                return (
                  <span
                    className={`text-sm ${len === 10 ? "text-muted-foreground" : "text-destructive"}`}
                    data-testid={`hint-profile-${field.key}`}
                  >
                    {t("profile.phoneDigitsHint")} ({len}/10)
                  </span>
                );
              }
              if ((field.key === "firstName" || field.key === "lastName") && formData[field.key] && formData[field.key].length > 0 && !/^[a-zA-Z\s]+$/.test(formData[field.key])) {
                return <span className="text-sm text-destructive" data-testid={`hint-profile-${field.key}`}>{t("profile.lettersOnly")}</span>;
              }
              return null;
            };

            const inputValue = field.key === "phone"
              ? formatPhoneDisplay(formData[field.key] || "")
              : (formData[field.key] || "");

            return (
              <div key={field.key} className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <field.icon className="h-3.5 w-3.5" />
                  {field.label}
                </label>
                {isEditing ? (
                  <>
                    <Input
                      type={field.type}
                      value={inputValue}
                      onChange={handleChange}
                      className="text-lg min-h-[48px]"
                      maxLength={field.key === "phone" ? 12 : undefined}
                      placeholder={field.key === "phone" ? "718-000-0000" : undefined}
                      data-testid={`input-profile-${field.key}`}
                    />
                    {getValidationHint()}
                  </>
                ) : (
                  <p className="text-lg font-medium" data-testid={`text-profile-${field.key}`}>
                    {field.key === "dateOfBirth" ? formatDOB(user[field.key]) : field.key === "phone" && user[field.key] ? formatPhoneDisplay(user[field.key]) : (user[field.key] || t("common.notSet"))}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}



function formatThresholdLabel(hours: number, t: (key: string, defaultValue?: string) => string): string {
  const map: Record<number, string> = {
    2: t("settings.threshold2h", "2 hours"),
    4: t("settings.threshold4h", "4 hours"),
    8: t("settings.threshold8h", "8 hours"),
    12: t("settings.threshold12h", "12 hours"),
    24: t("settings.threshold24h", "1 day (default)"),
    48: t("settings.threshold48h", "2 days"),
    72: t("settings.threshold72h", "3 days"),
    168: t("settings.threshold168h", "1 week"),
  };
  return map[hours] ?? `${hours}h`;
}

function SettingsSummaryCard({ user }: { user: { preferredDeliveryMethod?: string | null } | null }) {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const { data: notifPrefs } = useQuery<{ pharmacyAlertsEnabled: boolean; inactivityThresholdHours: number }>({
    queryKey: ["/api/notification-preferences"],
  });

  const alertsEnabled = notifPrefs?.pharmacyAlertsEnabled ?? true;
  const inactivityThreshold = notifPrefs?.inactivityThresholdHours ?? 24;
  const deliveryMethod = user?.preferredDeliveryMethod || "pickup";

  const rows = [
    {
      icon: <Globe className="h-4 w-4 text-primary" />,
      label: t("settings.languageRowLabel", "Language"),
      value: i18n.language?.startsWith("es") ? t("settings.spanish") : t("settings.english"),
      testId: "row-settings-summary-language",
    },
    {
      icon: theme === "dark" ? <Moon className="h-4 w-4 text-primary" /> : <Sun className="h-4 w-4 text-primary" />,
      label: t("settings.lightMode"),
      value: theme === "light" ? t("settings.lightModeOn", "On") : t("settings.lightModeOff", "Off"),
      testId: "row-settings-summary-appearance",
    },
    {
      icon: <Bell className="h-4 w-4 text-primary" />,
      label: t("settings.pharmacyAlerts"),
      value: alertsEnabled ? t("settings.alertsOn", "On") : t("settings.alertsOff", "Off"),
      testId: "row-settings-summary-notifications",
    },
    {
      icon: <Clock className="h-4 w-4 text-primary" />,
      label: t("settings.missedAlertsThresholdLabel", "Missed alert window"),
      value: formatThresholdLabel(inactivityThreshold, (key, defaultValue) =>
        defaultValue ? t(key, defaultValue) : t(key)
      ),
      testId: "row-settings-summary-inactivity-threshold",
    },
    {
      icon: <Truck className="h-4 w-4 text-primary" />,
      label: t("settings.preferredDeliveryMethod"),
      value: deliveryMethod === "delivery" ? t("settings.delivery") : t("settings.pickup"),
      testId: "row-settings-summary-delivery",
    },
  ];

  return (
    <Card data-testid="card-settings-summary" className="animate-drift-up-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <CardTitle className="text-xl">{t("settings.appSettingsLinkTitle")}</CardTitle>
        </div>
        <Link href="/settings" data-testid="link-settings-manage-all">
          <Button variant="ghost" size="sm" className="text-primary text-sm h-auto py-1.5 px-3" data-testid="button-settings-manage-all">
            {t("settings.manage", "Manage")}
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="pt-0 space-y-0">
        {rows.map((row) => (
          <Link href="/settings" key={row.testId}>
            <div
              className="flex items-center justify-between py-3 hover:bg-muted/30 active:bg-muted/50 rounded-md transition-colors cursor-pointer"
              data-testid={row.testId}
            >
              <div className="flex items-center gap-3">
                <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  {row.icon}
                </div>
                <div>
                  <span className="text-base font-medium">{row.label}</span>
                  <p className="text-xs text-muted-foreground">{t("settings.changeInSettings", "Change in Settings")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground" data-testid={`text-${row.testId}-value`}>{row.value}</span>
                <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function DocumentsSection() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { isProxy, activePatientId } = usePatientContext();
  const pUrl = (base: string) => proxyUrl(base, activePatientId, isProxy);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState<string>("");
  const [showUploadForm, setShowUploadForm] = useState(false);

  const { data: documents = [], isLoading } = useQuery<UserDocument[]>({
    queryKey: [pUrl("/api/documents")],
  });

  const uploadMutation = useMutation({
    mutationFn: async (doc: { type: string; label: string; imageData: string }) => {
      const res = await apiRequest("POST", pUrl("/api/documents"), doc);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/documents")] });
      toast({ title: t("profile.documentUploaded"), description: t("profile.documentUploadedDesc") });
      setShowUploadForm(false);
      setUploadType("");
    },
    onError: () => {
      toast({ title: t("profile.uploadFailed"), description: t("profile.uploadFailedDesc"), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", pUrl(`/api/documents/${id}`));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/documents")] });
      toast({ title: t("profile.documentRemoved"), description: t("profile.documentRemovedDesc") });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message || t("profile.uploadFailedDesc"),
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (uploadMutation.isPending) return;
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: t("profile.fileTooLarge"), description: t("profile.fileTooLargeDesc"), variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (uploadMutation.isPending) return;
      const imageData = reader.result as string;
      const docTypes: Record<string, string> = {
        insurance_card: t("profile.insuranceCard"),
        government_id: t("profile.governmentId"),
        prescription: t("profile.prescriptionDocument"),
        other: t("profile.otherDocument"),
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

  const docTypeOptions = [
    { value: "insurance_card", label: t("profile.insuranceCard"), icon: CreditCard },
    { value: "government_id", label: t("profile.governmentId"), icon: IdCard },
    { value: "prescription", label: t("profile.prescriptionDoc"), icon: FileText },
    { value: "other", label: t("profile.otherDoc"), icon: FileText },
  ];

  const getDocIcon = (type: string) => {
    if (type === "insurance_card") return CreditCard;
    if (type === "government_id") return IdCard;
    return FileText;
  };

  return (
    <Card data-testid="card-documents" className="animate-drift-up-6">
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-md bg-orange-100/50 dark:bg-orange-900/20 flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <CardTitle className="text-xl">{t("profile.myDocuments")}</CardTitle>
        </div>
        {!showUploadForm && (
          <Button
            type="button"
            onClick={() => setShowUploadForm(true)}
            className="min-h-[48px] text-base"
            data-testid="button-add-document"
          >
            <Plus className="h-5 w-5 mr-2" />
            {t("common.add")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {showUploadForm && (
          <div className="rounded-md border bg-muted/30 p-4 space-y-4">
            <p className="text-lg font-semibold">{t("profile.selectDocumentType")}</p>
            <div className="grid grid-cols-2 gap-3">
              {docTypeOptions.map((opt) => (
                <Button
                  type="button"
                  key={opt.value}
                  variant={uploadType === opt.value ? "default" : "outline"}
                  size="lg"
                  className="text-base h-auto py-3 flex-col gap-1 text-center leading-tight whitespace-normal"
                  onClick={() => setUploadType(opt.value)}
                  data-testid={`button-doctype-${opt.value}`}
                >
                  <opt.icon className="h-6 w-6 shrink-0" />
                  {opt.label}
                </Button>
              ))}
            </div>
            {uploadType && (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  size="lg"
                  className="text-base w-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMutation.isPending}
                  data-testid="button-upload-file"
                >
                  <Upload className="h-5 w-5 mr-2" />
                  {uploadMutation.isPending ? t("common.uploading") : t("profile.file")}
                </Button>
                <Button
                  type="button"
                  size="lg"
                  className="text-base w-full"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.setAttribute("capture", "environment");
                      fileInputRef.current.click();
                      fileInputRef.current.removeAttribute("capture");
                    }
                  }}
                  disabled={uploadMutation.isPending}
                  data-testid="button-camera-capture"
                >
                  <Camera className="h-5 w-5 mr-2" />
                  {t("profile.photo")}
                </Button>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full text-lg"
              onClick={() => { setShowUploadForm(false); setUploadType(""); }}
              data-testid="button-cancel-upload"
            >
              {t("common.cancel")}
            </Button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
          data-testid="input-file-upload"
        />

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-lg">{t("profile.noDocumentsYet")}</p>
            <p className="text-base">{t("profile.addDocsForQuickAccess")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => {
              const DocIcon = getDocIcon(doc.type);
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-4 p-3 rounded-md border bg-card hover-elevate"
                  data-testid={`card-document-${doc.id}`}
                >
                  <div className="w-14 h-14 rounded-md border overflow-hidden flex-shrink-0 bg-muted flex items-center justify-center">
                    {doc.imageData.startsWith("data:image") ? (
                      <img
                        src={doc.imageData}
                        alt={doc.label}
                        className="w-full h-full object-cover"
                        data-testid={`img-document-${doc.id}`}
                      />
                    ) : (
                      <DocIcon className="h-7 w-7 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-medium truncate" data-testid={`text-doc-label-${doc.id}`}>{doc.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString(getDateLocale(i18n.language)) : ""}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(doc.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-doc-${doc.id}`}
                  >
                    <Trash2 className="h-5 w-5 text-muted-foreground" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const addDoctorFormSchema = z.object({
  name: z.string().min(1, "Doctor name is required"),
  specialty: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  npi: z.string().optional(),
});

type AddDoctorFormValues = z.infer<typeof addDoctorFormSchema>;

function MyCareTeamSection() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isProxy, activePatientId } = usePatientContext();
  const pUrl = (base: string) => proxyUrl(base, activePatientId, isProxy);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PatientDoctor | null>(null);

  const { data: doctors = [], isLoading } = useQuery<PatientDoctor[]>({
    queryKey: [pUrl("/api/doctors")],
  });

  const form = useForm<AddDoctorFormValues>({
    resolver: zodResolver(addDoctorFormSchema),
    defaultValues: {
      name: "",
      specialty: "",
      phone: "",
      address: "",
      npi: "",
    },
  });

  const addDoctorMutation = useMutation({
    mutationFn: async (data: AddDoctorFormValues) => {
      const res = await apiRequest("POST", pUrl("/api/doctors"), data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/doctors")] });
      toast({ title: t("profile.doctorAdded"), description: t("profile.doctorAddedDesc") });
      setShowAddForm(false);
      form.reset();
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("profile.failedAddDoctor"), variant: "destructive" });
    },
  });

  const deleteDoctorMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", pUrl(`/api/doctors/${id}`));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [pUrl("/api/doctors")] });
      toast({ title: t("profile.doctorRemoved"), description: t("profile.doctorRemovedDesc") });
      setDeleteTarget(null);
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("profile.failedRemoveDoctor"), variant: "destructive" });
    },
  });

  const onSubmit = (data: AddDoctorFormValues) => {
    if (addDoctorMutation.isPending) return;
    addDoctorMutation.mutate(data);
  };

  return (
    <>
      <Card data-testid="card-care-team" className="animate-drift-up-5">
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
              <Stethoscope className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-xl">{t("profile.myCareTeam")}</CardTitle>
          </div>
          {!showAddForm && (
            <Button
              onClick={() => setShowAddForm(true)}
              className="min-h-[48px] text-base"
              data-testid="button-add-doctor"
            >
              <Plus className="h-5 w-5 mr-2" />
              {t("profile.addDoctor")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {showAddForm && (
            <div className="rounded-md border bg-muted/30 p-4 space-y-4">
              <p className="text-lg font-semibold">{t("profile.addADoctor")}</p>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">{t("profile.doctorName")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Dr. Jane Smith"
                            className="text-lg min-h-[48px]"
                            data-testid="input-doctor-name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="specialty"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">{t("profile.specialty")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. Cardiology, Family Medicine"
                            className="text-lg min-h-[48px]"
                            data-testid="input-doctor-specialty"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base">{t("profile.phone")}</FormLabel>
                          <FormControl>
                            <Input
                              type="tel"
                              placeholder="(555) 123-4567"
                              className="text-lg min-h-[48px]"
                              data-testid="input-doctor-phone"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="npi"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base">{t("profile.npiNumber")}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="10-digit NPI"
                              className="text-lg min-h-[48px]"
                              data-testid="input-doctor-npi"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">{t("profile.officeAddress")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="123 Medical Dr, Suite 100"
                            className="text-lg min-h-[48px]"
                            data-testid="input-doctor-address"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex gap-3">
                    <Button
                      type="submit"
                      size="lg"
                      className="flex-1 text-base"
                      disabled={addDoctorMutation.isPending}
                      data-testid="button-submit-doctor"
                    >
                      {addDoctorMutation.isPending ? t("profile.adding") : t("profile.addDoctor")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="flex-1 text-base"
                      onClick={() => { setShowAddForm(false); form.reset(); }}
                      data-testid="button-cancel-add-doctor"
                    >
                      {t("common.cancel")}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : doctors.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Stethoscope className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="text-lg">{t("profile.noDoctorsYet")}</p>
              <p className="text-base">{t("profile.addDoctorsForQuickAccess")}</p>
            </div>
          ) : (
            <Accordion type="single" collapsible className="space-y-3">
              {doctors.map((doctor, index) => (
                <AccordionItem
                  key={doctor.id}
                  value={`doctor-${doctor.id}`}
                  className={`border rounded-md px-4 animate-drift-up-${Math.min(index + 1, 8)}`}
                  data-testid={`card-doctor-${doctor.id}`}
                >
                  <AccordionTrigger
                    className="hover:no-underline py-4 min-h-[56px]"
                    data-testid={`button-expand-doctor-${doctor.id}`}
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-lg font-medium" data-testid={`text-doctor-name-${doctor.id}`}>
                        {doctor.name}
                      </span>
                      {doctor.specialty && (
                        <Badge variant="secondary" data-testid={`badge-doctor-specialty-${doctor.id}`}>
                          {doctor.specialty}
                        </Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="text-base space-y-4">
                    <div className="space-y-3">
                      {doctor.phone && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-4 w-4 shrink-0" />
                          <span data-testid={`text-doctor-phone-${doctor.id}`}>{doctor.phone}</span>
                        </div>
                      )}
                      {doctor.address && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-4 w-4 shrink-0" />
                          <span data-testid={`text-doctor-address-${doctor.id}`}>{doctor.address}</span>
                        </div>
                      )}
                      {doctor.npi && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <IdCard className="h-4 w-4 shrink-0" />
                          <span data-testid={`text-doctor-npi-${doctor.id}`}>NPI: {doctor.npi}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      {doctor.phone && (
                        <Button
                          variant="outline"
                          size="lg"
                          className="text-base"
                          asChild
                          data-testid={`button-call-doctor-${doctor.id}`}
                        >
                          <a href={`tel:${doctor.phone}`}>
                            <Phone className="h-5 w-5 mr-2" />
                            {t("profile.callOffice")}
                          </a>
                        </Button>
                      )}
                      {doctor.address && (
                        <Button
                          variant="outline"
                          size="lg"
                          className="text-base"
                          asChild
                          data-testid={`button-directions-doctor-${doctor.id}`}
                        >
                          <a
                            href={`https://maps.google.com/?q=${encodeURIComponent(doctor.address)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Navigation className="h-5 w-5 mr-2" />
                            {t("profile.getDirections")}
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="lg"
                        className="text-base text-destructive"
                        onClick={() => setDeleteTarget(doctor)}
                        data-testid={`button-delete-doctor-${doctor.id}`}
                      >
                        <Trash2 className="h-5 w-5 mr-2" />
                        {t("profile.remove")}
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("profile.removeDoctor")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("profile.removeDoctorConfirm")} {t("profile.removeDoctorDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-doctor">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteTarget) deleteDoctorMutation.mutate(deleteTarget.id); }}
              data-testid="button-confirm-delete-doctor"
            >
              {deleteDoctorMutation.isPending ? t("profile.removing") : t("profile.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface IncomingCaregiverRequest {
  id: number;
  caregiverId: string;
  caregiverName: string;
  relationship: string | null;
  createdAt: string | null;
}

function PendingCaregiverRequestsSection() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data: requests = [], isLoading } = useQuery<IncomingCaregiverRequest[]>({
    queryKey: ["/api/caregiver/incoming-requests"],
  });

  const respondMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "approve" | "decline" }) => {
      const res = await apiRequest("PATCH", `/api/caregiver/links/${id}/respond`, { action });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/caregiver/incoming-requests"] });
      if (variables.action === "approve") {
        toast({ title: t("profile.caregiverApproved", "Caregiver approved"), description: t("profile.caregiverApprovedDesc", "They can now view your health information.") });
      } else {
        toast({ title: t("profile.caregiverDeclined", "Request declined"), description: t("profile.caregiverDeclinedDesc", "The caregiver request has been removed.") });
      }
    },
    onError: () => {
      toast({ title: t("common.error"), description: t("profile.caregiverRespondFailed", "Failed to respond to request."), variant: "destructive" });
    },
  });

  if (isLoading || requests.length === 0) return null;

  return (
    <Card data-testid="card-pending-caregiver-requests" className="animate-drift-up-3 border-amber-200 dark:border-amber-800">
      <CardHeader className="flex flex-row items-center gap-2">
        <div className="h-9 w-9 rounded-md bg-amber-100/50 dark:bg-amber-900/20 flex items-center justify-center shrink-0">
          <UserPlus className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <CardTitle className="text-xl">{t("profile.pendingCaregiverRequests", "Pending Caregiver Requests")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("profile.pendingCaregiverRequestsDesc", "Review who is requesting access to your health information.")}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {requests.map((req) => (
          <div
            key={req.id}
            className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-md border bg-card"
            data-testid={`card-caregiver-request-${req.id}`}
          >
            <Avatar className="h-12 w-12 shrink-0">
              <AvatarFallback className="text-lg font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                {req.caregiverName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-medium truncate" data-testid={`text-caregiver-name-${req.id}`}>
                {req.caregiverName}
              </p>
              {req.relationship && (
                <p className="text-sm text-muted-foreground capitalize" data-testid={`text-caregiver-relationship-${req.id}`}>
                  {req.relationship}
                </p>
              )}
            </div>
            <div className="flex gap-3 shrink-0">
              <Button
                size="lg"
                className="text-base min-h-[48px]"
                onClick={() => respondMutation.mutate({ id: req.id, action: "approve" })}
                disabled={respondMutation.isPending}
                data-testid={`button-approve-caregiver-${req.id}`}
              >
                <CheckCircle2 className="h-5 w-5 mr-2" />
                {t("profile.approve", "Approve")}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="text-base min-h-[48px] border-destructive/40 text-destructive hover:bg-destructive/5"
                onClick={() => respondMutation.mutate({ id: req.id, action: "decline" })}
                disabled={respondMutation.isPending}
                data-testid={`button-decline-caregiver-${req.id}`}
              >
                <X className="h-5 w-5 mr-2" />
                {t("profile.decline", "Decline")}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

interface LinkedPatient {
  linkId: number;
  patientId: string;
  firstName: string | null;
  lastName: string | null;
  relationship: string | null;
  status: string;
}

const addPatientFormSchema = z.object({
  patientName: z.string().min(1, "Patient name is required"),
  dob: z.string().min(1, "Date of birth is required"),
});

type AddPatientFormValues = z.infer<typeof addPatientFormSchema>;

function MyPatientsSection() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: patients = [], isLoading } = useQuery<LinkedPatient[]>({
    queryKey: ["/api/caregiver/patients"],
  });

  const form = useForm<AddPatientFormValues>({
    resolver: zodResolver(addPatientFormSchema),
    defaultValues: {
      patientName: "",
      dob: "",
    },
  });

  const linkPatientMutation = useMutation({
    mutationFn: async (data: AddPatientFormValues) => {
      const res = await apiRequest("POST", "/api/caregiver/link-patient", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/caregiver/patients"] });
      toast({ title: t("profile.linkRequestSent"), description: t("profile.linkRequestSentDesc") });
      setShowAddForm(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({ title: t("common.error"), description: error.message || t("profile.failedAddDoctor"), variant: "destructive" });
    },
  });

  const onSubmit = (data: AddPatientFormValues) => {
    linkPatientMutation.mutate(data);
  };

  const getStatusBadge = (status: string) => {
    if (status === "approved") {
      return (
        <Badge variant="secondary" className="gap-1" data-testid={`badge-status-approved`}>
          <CheckCircle2 className="h-3 w-3" />
          {t("profile.approved")}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1" data-testid={`badge-status-pending`}>
        <Clock className="h-3 w-3" />
        {t("profile.pending")}
      </Badge>
    );
  };

  return (
    <Card data-testid="card-my-patients" className="animate-drift-up-5">
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-md bg-blue-100/50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
            <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <CardTitle className="text-xl">{t("profile.myPatients")}</CardTitle>
        </div>
        {!showAddForm && (
          <Button
            onClick={() => setShowAddForm(true)}
            className="min-h-[48px] text-base"
            data-testid="button-add-patient"
          >
            <UserPlus className="h-5 w-5 mr-2" />
            {t("profile.addPatient")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {showAddForm && (
          <div className="rounded-md border bg-muted/30 p-4 space-y-4">
            <p className="text-lg font-semibold">{t("profile.addAnotherPatient")}</p>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="patientName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">{t("profile.patientFullName")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. John Smith"
                          className="text-lg min-h-[48px]"
                          data-testid="input-patient-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dob"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">{t("profile.dateOfBirth")}</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          className="text-lg min-h-[48px]"
                          data-testid="input-patient-dob"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex gap-3">
                  <Button
                    type="submit"
                    size="lg"
                    className="flex-1 text-lg"
                    disabled={linkPatientMutation.isPending}
                    data-testid="button-submit-link-patient"
                  >
                    {linkPatientMutation.isPending ? t("common.sending") : t("home.sendLinkRequest")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="text-lg"
                    onClick={() => { setShowAddForm(false); form.reset(); }}
                    data-testid="button-cancel-add-patient"
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : patients.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-lg">{t("profile.noPatientsLinked")}</p>
            <p className="text-base">{t("profile.addPatientToManageCare")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {patients.map((patient) => {
              const patientName = [patient.firstName, patient.lastName].filter(Boolean).join(" ") || t("profile.patient");
              const initials = `${(patient.firstName || "")[0] || ""}${(patient.lastName || "")[0] || ""}`.toUpperCase() || "P";
              return (
                <div
                  key={patient.linkId}
                  className="flex items-center gap-4 p-4 rounded-md border bg-card"
                  data-testid={`card-patient-${patient.linkId}`}
                >
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="text-lg font-semibold bg-primary/10">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-medium truncate" data-testid={`text-patient-name-${patient.linkId}`}>{patientName}</p>
                    {patient.relationship && (
                      <p className="text-sm text-muted-foreground capitalize" data-testid={`text-patient-relationship-${patient.linkId}`}>
                        {patient.relationship}
                      </p>
                    )}
                  </div>
                  {getStatusBadge(patient.status)}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LoyaltySection({ pUrl }: { pUrl: (base: string) => string }) {
  const { data: loyaltyStats } = useQuery<{ balance: number; tier: string; streakDays: number }>({
    queryKey: [pUrl("/api/loyalty")],
    staleTime: 30_000,
  });

  const { data: history = [], isLoading: historyLoading } = useQuery<PointsTransaction[]>({
    queryKey: [pUrl("/api/loyalty/history")],
    staleTime: 30_000,
  });

  const { data: earningRules = [] } = useQuery<EarningRule[]>({
    queryKey: ["/api/earning-rules"],
    staleTime: 60_000,
  });

  const formatSource = (source: string) => {
    switch (source) {
      case "medication_dose": return "Dose taken";
      case "order_placed": return "Order placed";
      case "order_received": return "Order received";
      case "order_complete": return "Order completed";
      case "reward_redeemed": return "Reward redeemed";
      default: return source.replace(/_/g, " ");
    }
  };

  return (
    <Card data-testid="card-loyalty-section" className="animate-drift-up-3">
      <CardHeader className="flex flex-row items-center gap-2">
        <div className="h-9 w-9 rounded-md bg-amber-100/50 dark:bg-amber-900/20 flex items-center justify-center shrink-0">
          <Award className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <CardTitle className="text-xl">Loyalty & Points</CardTitle>
          {loyaltyStats && (
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <Badge
                variant="outline"
                className={
                  loyaltyStats.tier === "gold"
                    ? "text-xs capitalize bg-yellow-100/60 text-yellow-700 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-700"
                    : loyaltyStats.tier === "silver"
                      ? "text-xs capitalize bg-slate-100/60 text-slate-600 border-slate-300 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-600"
                      : "text-xs capitalize bg-orange-100/60 text-orange-800 border-orange-300 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-700"
                }
                data-testid="badge-loyalty-tier"
              >
                {loyaltyStats.tier} tier
              </Badge>
              {loyaltyStats.streakDays > 0 && (
                <span className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400" data-testid="text-loyalty-streak">
                  <Flame className="h-3.5 w-3.5" />
                  {loyaltyStats.streakDays}-day streak
                </span>
              )}
              <span className="text-xs text-muted-foreground" data-testid="text-loyalty-balance">
                {loyaltyStats.balance} pts · ${(loyaltyStats.balance / POINTS_PER_DOLLAR).toFixed(2)} credit
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {earningRules.length > 0 && (
          <div className="space-y-2" data-testid="container-earning-rules">
            <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" />
              How to earn points
            </p>
            <div className="grid grid-cols-1 gap-2">
              {earningRules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between gap-2 p-3 rounded-md border bg-muted/30"
                  data-testid={`row-earning-rule-${rule.id}`}
                >
                  <div className="flex items-center gap-2">
                    {rule.action === "medication_dose" ? (
                      <Flame className="h-4 w-4 text-orange-500 shrink-0" />
                    ) : (
                      <Star className="h-4 w-4 text-amber-500 shrink-0" />
                    )}
                    <span className="text-sm">{rule.description}</span>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-sm font-bold" data-testid={`badge-rule-points-${rule.id}`}>
                    +{rule.pointsAwarded} pts
                  </Badge>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">1000 pts = $1.00 wellness credit</p>
          </div>
        )}

        <div className="space-y-2" data-testid="container-points-history">
          <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            Recent transactions
          </p>
          {historyLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-history">
              No transactions yet. Earn points by taking doses or placing orders!
            </p>
          ) : (
            <div className="space-y-1.5">
              {history.slice(0, 10).map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-md border bg-card"
                  data-testid={`row-transaction-${tx.id}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" data-testid={`text-tx-desc-${tx.id}`}>
                      {tx.description || formatSource(tx.source)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : ""}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-bold shrink-0 ${tx.type === "earn" || tx.type === "adjust" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                    data-testid={`text-tx-amount-${tx.id}`}
                  >
                    {tx.type === "earn" || tx.type === "adjust" ? "+" : "-"}{Math.abs(tx.amount)} pts
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Profile() {
  const { t } = useTranslation();
  const { user: authUser, isLoading: isAuthLoading, logout } = useAuth();
  const { toast } = useToast();
  const { isProxy, activePatientId } = usePatientContext();
  const pUrl = (base: string) => proxyUrl(base, activePatientId, isProxy);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});

  const { data: proxyProfile, isLoading: isProxyLoading } = useQuery<AppUser>({
    queryKey: [pUrl("/api/profile")],
    enabled: isProxy,
  });

  const user = isProxy && proxyProfile ? proxyProfile : authUser;
  const isLoading = isAuthLoading || (isProxy && isProxyLoading);

  const { data: medications = [] } = useQuery<Medication[]>({
    queryKey: [pUrl("/api/medications")],
    enabled: !!user,
  });

  const { data: loyaltyData } = useQuery<{ balance: number; tier: string; streakDays: number }>({
    queryKey: [pUrl("/api/loyalty")],
    enabled: !!user,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const res = await apiRequest("PATCH", pUrl("/api/profile"), data);
      return res.json();
    },
    onSuccess: async () => {
      if (isProxy) {
        await queryClient.invalidateQueries({ queryKey: [pUrl("/api/profile")] });
      } else {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] }),
          queryClient.invalidateQueries({ queryKey: ["/api/profile"] }),
        ]);
      }
      setIsEditing(false);
      toast({ title: t("profile.profileUpdated"), description: t("profile.profileUpdatedDesc") });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: apiErrorMessage(error, t("profile.profileUpdateFailedDesc")),
        variant: "destructive",
      });
    },
  });

  const startEditing = () => {
    setFormData({
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      phone: user?.phone || "",
      dateOfBirth: user?.dateOfBirth || "",
      deliveryAddress: user?.deliveryAddress || "",
      preferredDeliveryMethod: user?.preferredDeliveryMethod || "pickup",
    });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setFormData({});
  };

  const saveProfile = () => {
    if (updateProfileMutation.isPending) return;
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      toast({
        title: t("common.error"),
        description: "Please enter your first and last name before saving.",
        variant: "destructive",
      });
      return;
    }
    if (formData.phone && formData.phone.length > 0 && formData.phone.length !== 10) {
      toast({ title: t("profile.invalidPhone"), description: t("profile.invalidPhoneDesc"), variant: "destructive" });
      return;
    }
    if (formData.firstName && !/^[a-zA-Z\s]*$/.test(formData.firstName)) {
      toast({ title: t("profile.invalidName"), description: t("profile.firstNameLettersOnly"), variant: "destructive" });
      return;
    }
    if (formData.lastName && !/^[a-zA-Z\s]*$/.test(formData.lastName)) {
      toast({ title: t("profile.invalidName"), description: t("profile.lastNameLettersOnly"), variant: "destructive" });
      return;
    }
    updateProfileMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="p-4 max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!user) return null;

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || t("profile.patient");
  const initials = `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() || "U";

  return (
    <div className="p-4 pb-24 max-w-3xl mx-auto space-y-6">
      <div className="glass-card rounded-md p-6 flex flex-col sm:flex-row items-center gap-5 animate-drift-up" data-testid="card-profile-hero">
        <div className="relative">
          <Avatar className="h-24 w-24 border-4 border-background">
            <AvatarImage src={user.profileImageUrl || undefined} />
            <AvatarFallback className="text-3xl font-bold bg-primary/10">{initials}</AvatarFallback>
          </Avatar>
        </div>
        <div className="flex-1 text-center sm:text-left min-w-0">
          <h2 className="text-2xl font-bold tracking-tight" data-testid="text-profile-name">{fullName}</h2>
          {user.phone && (
            <p className="text-lg text-muted-foreground flex items-center justify-center sm:justify-start gap-1.5 mt-1" data-testid="text-profile-phone">
              <Phone className="h-4 w-4" />
              {user.phone}
            </p>
          )}
          {user.email && (
            <p className="text-base text-muted-foreground mt-0.5" data-testid="text-profile-email">
              {user.email}
            </p>
          )}
        </div>
        <div className="shrink-0">
          {!isEditing ? (
            <Button type="button" onClick={startEditing} className="min-h-[48px] text-base" data-testid="button-edit-profile">
              <Edit3 className="h-5 w-5 mr-2" />
              {t("profile.editProfile")}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={saveProfile}
                disabled={updateProfileMutation.isPending}
                className="min-h-[48px] text-base"
                data-testid="button-save-profile"
              >
                <Save className="h-5 w-5 mr-2" />
                {updateProfileMutation.isPending ? t("common.saving") : t("common.save")}
              </Button>
              <Button type="button" variant="outline" onClick={cancelEditing} disabled={updateProfileMutation.isPending} className="min-h-[48px] text-base" data-testid="button-cancel-edit">
                <X className="h-5 w-5 mr-2" />
                {t("common.cancel")}
              </Button>
            </div>
          )}
        </div>
      </div>

      <Link href="/settings" data-testid="link-profile-settings-top">
        <button
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border bg-card hover:bg-muted/40 active:bg-muted/60 transition-colors text-left min-h-[56px]"
          data-testid="button-profile-settings-top"
        >
          <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold">{t("settings.appSettingsLinkTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("settings.appSettingsLinkDesc")}</p>
          </div>
          <svg className="h-5 w-5 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </Link>

      {(user as any).concordiaId && (
        <div
          className="flex items-center justify-between px-4 py-3 rounded-xl border bg-card animate-drift-up-1"
          data-testid="card-patient-id"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <IdCard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Your Patient ID</p>
              <p className="text-xl font-bold tracking-widest text-primary" data-testid="text-concordia-id">{(user as any).concordiaId}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-right max-w-[120px] leading-snug">Quote this to staff or support</p>
        </div>
      )}

      {!user.dateOfBirth && !isEditing && (
        <Card className="border-orange-200 dark:border-orange-800 bg-orange-100/50 dark:bg-orange-900/20 animate-drift-up-1" data-testid="card-missing-dob-alert">
          <CardContent className="flex items-center gap-3 p-4 flex-wrap">
            <AlertTriangle className="h-6 w-6 text-orange-600 dark:text-orange-400 flex-shrink-0" />
            <div className="flex-1 min-w-[200px]">
              <p className="text-lg font-medium text-orange-600 dark:text-orange-400">{t("profile.dateOfBirthRequired")}</p>
              <p className="text-base text-muted-foreground">{t("profile.dateOfBirthRequiredDesc")}</p>
            </div>
            <Button variant="outline" onClick={startEditing} data-testid="button-add-dob">
              {t("profile.addNow")}
            </Button>
          </CardContent>
        </Card>
      )}

      <MemberCard
        userId={user.id}
        name={fullName}
        email={user.email}
        dateOfBirth={user.dateOfBirth}
        loyaltyPoints={loyaltyData?.balance ?? 0}
        wellnessCredits={loyaltyData ? (loyaltyData.balance / POINTS_PER_DOLLAR).toFixed(2) : "0.00"}
        concordiaId={(user as any).concordiaId}
      />

      <SettingsSummaryCard user={user} />

      <Button
        variant="outline"
        className="w-full min-h-[48px] text-sm font-semibold"
        data-testid="button-view-loyalty-dashboard"
        asChild
      >
        <Link href={`/loyalty/${user.id}`} data-testid="link-view-loyalty-dashboard">
          View Loyalty Dashboard
        </Link>
      </Button>

      <LoyaltySection pUrl={pUrl} />

      <ProfileInfoSection user={user} isEditing={isEditing} formData={formData} setFormData={setFormData} />

      {!isProxy && authUser?.userRole !== "caregiver" && <PendingCaregiverRequestsSection />}


      {!isProxy && authUser?.userRole === "caregiver" && <MyPatientsSection />}

      <MyCareTeamSection />

      <DocumentsSection />

      <div className="pt-2 pb-2">
        <Button
          variant="outline"
          size="lg"
          className="w-full text-base min-h-[52px] border-destructive/40 text-destructive hover:bg-destructive/5 dark:border-destructive/40 dark:text-destructive"
          onClick={() => logout()}
          data-testid="button-sign-out"
        >
          <LogOut className="h-5 w-5 mr-2" />
          {t("profile.logOut")}
        </Button>
      </div>
    </div>
  );
}
