import { useEffect, useState } from "react";
import { useUser } from "@clerk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileKey2, LogOut, Search, ShoppingBag, UserRound } from "lucide-react";
import type { OtcProduct } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function StandaloneAccount({
  name,
  lastName,
  onSignOut,
  section,
  home = false,
}: {
  name: string | null;
  lastName: string | null;
  onSignOut: () => void;
  section?: "shop" | "profile" | "records";
  home?: boolean;
}) {
  const [selectedTab, setTab] = useState<"shop" | "profile" | "records">("shop");
  const tab = section ?? selectedTab;
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OtcProduct | null>(null);
  const [patientId, setPatientId] = useState("");
  const [linkMessage, setLinkMessage] = useState("");
  const [firstName, setFirstName] = useState(name ?? "");
  const [familyName, setFamilyName] = useState(lastName ?? "");
  const { user: clerkUser } = useUser();
  const signInEmail = clerkUser?.primaryEmailAddress?.emailAddress;
  const queryClient = useQueryClient();
  const products = useQuery<OtcProduct[]>({ queryKey: ["/api/otc/products"] });
  const linkStatus = useQuery<{ request: { status: string; rejectionReason?: string | null } | null }>({
    queryKey: ["/api/pharmacy-link-requests/me"],
    queryFn: async () => (await apiRequest("GET", "/api/pharmacy-link-requests/me")).json(),
    refetchInterval: (query) => query.state.data?.request?.status === "pending" ? 15_000 : false,
  });
  const requestLink = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/pharmacy-link-requests", { concordiaId: patientId })).json(),
    onSuccess: () => {
      setPatientId("");
      setLinkMessage("If eligible, your request has been submitted for pharmacy review.");
      queryClient.invalidateQueries({ queryKey: ["/api/pharmacy-link-requests/me"] });
    },
  });
  useEffect(() => {
    if (linkStatus.data?.request?.status === "approved") {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    }
  }, [linkStatus.data?.request?.status, queryClient]);
  const saveProfile = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", "/api/auth/standalone-profile", {
        firstName, lastName: familyName,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
  });
  const available = (products.data ?? []).filter((p) => p.isAvailable && (p.stockCount ?? 0) > 0);
  const filtered = available.filter((p) =>
    `${p.name} ${p.brand ?? ""} ${p.category}`.toLowerCase().includes(search.toLowerCase().trim()),
  );

  return (
    <div className={section ? "bg-background" : "min-h-dvh bg-background pb-24"}>
      {!section && <header className="border-b bg-card px-4 py-5">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <div>
            <p className="text-xl font-bold">ConcordiaCare</p>
            <p className="text-sm text-muted-foreground">Welcome{name ? `, ${name}` : ""}</p>
            {signInEmail && <p className="text-sm text-muted-foreground break-all" data-testid="text-app-signin-email">App sign-in: {signInEmail}</p>}
          </div>
          <Button type="button" variant="outline" className="min-h-11" onClick={onSignOut} data-testid="button-standalone-sign-out">
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Sign out
          </Button>
        </div>
      </header>}

      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        {tab === "shop" ? (
          <section aria-labelledby="standalone-shop-title" className="space-y-5">
            <div>
              <h1 id="standalone-shop-title" className="text-2xl font-bold">{home ? "Home" : "Shop"}</h1>
              <p className="mt-1 text-muted-foreground">Browse the pharmacy catalog. Connect your pharmacy records from {section ? "Records in the menu" : "the Records tab"} to use checkout, prescriptions, and messages.</p>
            </div>
            <label className="relative block">
              <span className="sr-only">Search products</span>
              <Search className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <Input className="h-12 pl-12" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" data-testid="input-standalone-product-search" />
            </label>
            {products.isLoading ? <p role="status">Loading products…</p>
              : products.isError ? (
                <div role="alert" className="rounded-xl border p-5">
                  <p>Products are unavailable right now.</p>
                  <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={() => products.refetch()} data-testid="button-standalone-retry-products">Try again</Button>
                </div>
              ) : filtered.length === 0 ? <p className="rounded-xl border p-5 text-muted-foreground">No products found.</p>
                : (
                  <div className="grid grid-cols-2 gap-3">
                    {filtered.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        className="overflow-hidden rounded-xl border bg-card text-left shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                        onClick={() => setSelected(product)}
                        data-testid={`button-standalone-product-${product.id}`}
                      >
                        <div className="flex aspect-square items-center justify-center bg-muted">
                          {product.imageUrl ? <img className="h-full w-full object-contain" loading="lazy" src={product.imageUrl} alt="" />
                            : <ShoppingBag className="h-10 w-10 text-muted-foreground" aria-hidden="true" />}
                        </div>
                        <div className="space-y-1 p-3">
                          <p className="text-xs text-muted-foreground">{product.category}</p>
                          <p className="font-semibold leading-snug">{product.name}</p>
                          {product.price && <p className="font-medium text-primary">${product.price}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
            {selected && (
              <Card>
                <CardContent className="space-y-3 p-5">
                  <h2 className="text-xl font-bold">{selected.name}</h2>
                  {selected.brand && <p className="text-sm text-muted-foreground">{selected.brand}</p>}
                  {selected.description && <p className="leading-relaxed">{selected.description}</p>}
                  <p className="text-sm text-muted-foreground">Purchasing is not available for this separate account.</p>
                  <Button type="button" variant="outline" className="min-h-11" onClick={() => setSelected(null)} data-testid="button-standalone-close-product">Close details</Button>
                </CardContent>
              </Card>
            )}
          </section>
        ) : tab === "profile" ? (
          <section aria-labelledby="standalone-profile-title" className="space-y-5">
            <div>
              <h1 id="standalone-profile-title" className="text-2xl font-bold">Your profile</h1>
              <p className="mt-1 text-muted-foreground">This app remembers your account when you sign in again with the same app login. These details stay separate from the pharmacy website until your records are verified and connected.</p>
            </div>
            <Card>
              <CardContent className="p-5">
                <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); saveProfile.mutate(); }}>
                  <label className="block space-y-2">
                    <span className="font-medium">First name</span>
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={100} className="h-12" data-testid="input-standalone-first-name" />
                  </label>
                  <label className="block space-y-2">
                    <span className="font-medium">Last name</span>
                    <Input value={familyName} onChange={(e) => setFamilyName(e.target.value)} maxLength={100} className="h-12" data-testid="input-standalone-last-name" />
                  </label>
                  <Button type="submit" className="min-h-12 w-full" disabled={saveProfile.isPending} data-testid="button-standalone-save-profile">
                    {saveProfile.isPending ? "Saving…" : "Save profile"}
                  </Button>
                  {saveProfile.isSuccess && !saveProfile.isPending && <p role="status" className="flex items-center gap-2 text-sm text-emerald-700"><Check className="h-4 w-4" /> Profile saved.</p>}
                  {saveProfile.isError && <p role="alert" className="text-sm text-destructive">Could not save your profile. Please try again.</p>}
                </form>
              </CardContent>
            </Card>
          </section>
        ) : (
          <section aria-labelledby="standalone-records-title" className="space-y-5">
            <div>
              <h1 id="standalone-records-title" className="text-2xl font-bold">Connect your pharmacy records</h1>
              <p className="mt-1 text-muted-foreground">Your ConcordiaCare sign-in can be different from your pharmacy website sign-in. Pharmacy staff must verify the correct patient record before it appears here.</p>
              {clerkUser?.id && <p className="mt-3 rounded-lg bg-muted p-3 text-sm">If staff asks, show them your app sign-in ID: <code className="block select-all break-all pt-1 font-mono" data-testid="text-standalone-signin-id">{clerkUser.id}</code></p>}
            </div>
            <Card><CardContent className="space-y-5 p-5">
              {linkStatus.isLoading ? <p role="status">Checking connection status…</p>
                : linkStatus.isError ? (
                  <div role="alert">
                    <p>We couldn't check your connection status. Please try again.</p>
                    <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={() => linkStatus.refetch()} data-testid="button-standalone-retry-link-status">Try again</Button>
                  </div>
                ) : linkStatus.data?.request?.status === "pending" ? (
                  <div role="status" className="space-y-3">
                    <h2 className="text-lg font-semibold">Waiting for pharmacy review</h2>
                    <p>Your request was sent only after you selected Connect. Your pharmacy team will verify the patient ID. This page checks for approval automatically.</p>
                    <Button type="button" variant="outline" className="min-h-11" onClick={() => linkStatus.refetch()} data-testid="button-standalone-check-approval">Check now</Button>
                  </div>
                ) : linkStatus.data?.request?.status === "approved" ? (
                  <div role="status" className="space-y-3">
                    <h2 className="text-lg font-semibold">Your records are connected</h2>
                    <Button type="button" className="min-h-11" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] })} data-testid="button-standalone-open-app">Open the app</Button>
                  </div>
                ) : (
                  <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (/^CP-\d{6}$/.test(patientId)) requestLink.mutate(); }}>
                    {linkStatus.data?.request?.status === "rejected" && (
                      <p role="alert" className="text-destructive">The pharmacy could not verify the previous request. Please contact the pharmacy to check your patient ID.</p>
                    )}
                    <label className="block space-y-2">
                      <span className="font-medium">Concordia patient ID</span>
                      <Input value={patientId} onChange={(e) => { setPatientId(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 9)); setLinkMessage(""); }} placeholder="CP-123456" className="h-12 font-mono" data-testid="input-standalone-patient-id" />
                    </label>
                    <p className="text-sm text-muted-foreground">Find this ID on your pharmacy paperwork, or ask the pharmacy. Entering it does not give anyone access to records; pharmacy staff must approve the connection.</p>
                    <Button type="submit" className="min-h-12 w-full" disabled={requestLink.isPending || !/^CP-\d{6}$/.test(patientId)} data-testid="button-standalone-request-connection">
                      {requestLink.isPending ? "Sending…" : "Send to pharmacy for review"}
                    </Button>
                    {linkMessage && <p role="status" className="text-sm">{linkMessage}</p>}
                    {requestLink.isError && <p role="alert" className="text-sm text-destructive">Could not send the request. Check the patient ID or try again later.</p>}
                  </form>
                )}
            </CardContent></Card>
          </section>
        )}
      </div>
      {!section && <nav aria-label="Account sections" className="fixed inset-x-0 bottom-0 border-t bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-2xl grid-cols-3">
          <Button type="button" variant="ghost" className={`min-h-16 rounded-none ${tab === "shop" ? "text-primary" : ""}`} onClick={() => setTab("shop")} aria-current={tab === "shop" ? "page" : undefined} data-testid="button-standalone-shop-tab">
            <ShoppingBag className="mr-2 h-5 w-5" aria-hidden="true" /> Shop
          </Button>
          <Button type="button" variant="ghost" className={`min-h-16 rounded-none ${tab === "profile" ? "text-primary" : ""}`} onClick={() => setTab("profile")} aria-current={tab === "profile" ? "page" : undefined} data-testid="button-standalone-profile-tab">
            <UserRound className="mr-2 h-5 w-5" aria-hidden="true" /> Profile
          </Button>
          <Button type="button" variant="ghost" className={`min-h-16 rounded-none ${tab === "records" ? "text-primary" : ""}`} onClick={() => setTab("records")} aria-current={tab === "records" ? "page" : undefined} data-testid="button-standalone-records-tab">
            <FileKey2 className="mr-2 h-5 w-5" aria-hidden="true" /> Records
          </Button>
        </div>
      </nav>}
    </div>
  );
}