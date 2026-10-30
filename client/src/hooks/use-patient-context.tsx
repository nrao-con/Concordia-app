import { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

interface PatientContextValue {
  activePatientId: string | null;
  setActivePatientId: (id: string | null) => void;
  isProxy: boolean;
  effectiveUserId: string | null;
}

const PatientContext = createContext<PatientContextValue | null>(null);

const STORAGE_KEY = "concordia_active_patient";

export function PatientProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const ownId = user?.id ?? null;

  const [activePatientId, setActivePatientIdRaw] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const setActivePatientId = useCallback(
    (id: string | null) => {
      setActivePatientIdRaw(id);
      try {
        if (id) {
          sessionStorage.setItem(STORAGE_KEY, id);
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      } catch {}
    },
    [],
  );

  useEffect(() => {
    if (isLoading) return;
    if (user && user.userRole !== "caregiver" && activePatientId) {
      setActivePatientId(null);
    }
    if (!user && activePatientId) {
      setActivePatientId(null);
    }
  }, [user, isLoading, activePatientId, setActivePatientId]);

  const isProxy = !!activePatientId && activePatientId !== ownId;
  const effectiveUserId = isProxy ? activePatientId : ownId;

  const value = useMemo<PatientContextValue>(
    () => ({ activePatientId, setActivePatientId, isProxy, effectiveUserId }),
    [activePatientId, setActivePatientId, isProxy, effectiveUserId],
  );

  return <PatientContext.Provider value={value}>{children}</PatientContext.Provider>;
}

export function usePatientContext() {
  const ctx = useContext(PatientContext);
  if (!ctx) {
    throw new Error("usePatientContext must be used within PatientProvider");
  }
  return ctx;
}

export function proxyUrl(baseUrl: string, patientId: string | null, isProxy: boolean): string {
  if (!isProxy || !patientId) return baseUrl;
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}patientId=${encodeURIComponent(patientId)}`;
}

export function useProxiedApi(baseUrl: string) {
  const { isProxy, activePatientId } = usePatientContext();
  const url = proxyUrl(baseUrl, activePatientId, isProxy);
  return { url, queryKey: [url] };
}
