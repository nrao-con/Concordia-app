import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Loader2 } from "lucide-react";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
  "DC",
];

interface AddressParts {
  street: string;
  apt: string;
  city: string;
  state: string;
  zip: string;
}

interface NominatimResult {
  display_name: string;
  address: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    state?: string;
    state_code?: string;
    postcode?: string;
  };
}

function parseAddress(addr: string): AddressParts {
  if (!addr.trim()) return { street: "", apt: "", city: "", state: "NY", zip: "" };
  const parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { street: "", apt: "", city: "", state: "NY", zip: "" };

  const last = parts[parts.length - 1];
  const stateZip = last.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);

  if (stateZip && parts.length >= 3) {
    const state = stateZip[1];
    const zip = stateZip[2];
    const city = parts[parts.length - 2];
    if (parts.length >= 4) {
      return { street: parts[0], apt: parts.slice(1, parts.length - 2).join(", "), city, state, zip };
    }
    return { street: parts[0], apt: "", city, state, zip };
  }

  return { street: parts[0] || "", apt: "", city: parts[1] || "", state: "NY", zip: "" };
}

function composeAddress(p: AddressParts): string {
  const parts = [p.street.trim()];
  if (p.apt.trim()) parts.push(p.apt.trim());
  if (p.city.trim()) parts.push(p.city.trim());
  const sv = p.state.trim().toUpperCase();
  const zv = p.zip.trim();
  if (sv || zv) parts.push(`${sv} ${zv}`.trim());
  return parts.join(", ");
}

interface AddressFieldsProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function AddressFields({ value, onChange, disabled }: AddressFieldsProps) {
  const [parts, setParts] = useState<AddressParts>(() => parseAddress(value));
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastValueRef = useRef(value);

  useEffect(() => {
    if (value !== lastValueRef.current) {
      lastValueRef.current = value;
      setParts(parseAddress(value));
    }
  }, [value]);

  const updateField = useCallback(
    (field: keyof AddressParts, val: string) => {
      setParts((prev) => {
        const next = { ...prev, [field]: val };
        const composed = composeAddress(next);
        lastValueRef.current = composed;
        onChange(composed);
        return next;
      });
    },
    [onChange]
  );

  const handleStreetChange = (val: string) => {
    updateField("street", val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestRef.current?.abort();
    if (val.length < 4) { setSuggestions([]); setShowSuggestions(false); setLoading(false); return; }
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      requestRef.current = controller;
      setLoading(true);
      try {
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=us&q=${encodeURIComponent(val)}&limit=5`,
          { headers: { "User-Agent": "ConcordiaCare/1.0 (concordiacareapp)" }, signal: controller.signal }
        );
        const data: NominatimResult[] = await resp.json();
        if (requestRef.current !== controller) return;
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch (error) {
        if (controller.signal.aborted) return;
        setSuggestions([]);
      } finally {
        if (requestRef.current === controller) setLoading(false);
      }
    }, 300);
  };

  const selectSuggestion = (result: NominatimResult) => {
    const a = result.address;
    const streetNum = a.house_number ? `${a.house_number} ` : "";
    const road = a.road || "";
    const street = `${streetNum}${road}`.trim();
    const city = a.city || a.town || a.village || a.suburb || "";
    const state = a.state_code?.toUpperCase() || (a.state ? a.state.slice(0, 2).toUpperCase() : "NY");
    const zip = a.postcode?.slice(0, 5) || "";
    const next: AddressParts = { street, apt: parts.apt, city, state, zip };
    setParts(next);
    const composed = composeAddress(next);
    lastValueRef.current = composed;
    onChange(composed);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestRef.current?.abort();
  }, []);

  return (
    <div className="space-y-3" ref={containerRef}>
      <div className="space-y-1.5">
        <label htmlFor="address-street" className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5" />
          Street Address
        </label>
        <div className="relative">
          <Input
            id="address-street"
            type="text"
            value={parts.street}
            onChange={(e) => handleStreetChange(e.target.value)}
            placeholder="e.g. 123 Grand Concourse"
            className="text-lg min-h-[48px] pr-8"
            disabled={disabled}
            autoComplete="off"
            data-testid="input-address-street"
          />
          {loading && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {showSuggestions && suggestions.length > 0 && (
            <ul
              className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden"
              data-testid="list-address-suggestions"
            >
              {suggestions.map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3 text-sm hover:bg-muted/60 active:bg-muted/80 transition-colors leading-snug min-h-[44px]"
                    onMouseDown={() => selectSuggestion(s)}
                    data-testid={`suggestion-address-${i}`}
                  >
                    {s.display_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="address-apt" className="text-sm font-medium text-muted-foreground">
          Apt / Unit / Suite <span className="text-xs opacity-60">(optional)</span>
        </label>
        <Input
          id="address-apt"
          type="text"
          value={parts.apt}
          onChange={(e) => updateField("apt", e.target.value)}
          placeholder="e.g. Apt 4B"
          className="text-lg min-h-[48px]"
          disabled={disabled}
          data-testid="input-address-apt"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2 sm:col-span-1">
          <label htmlFor="address-city" className="text-sm font-medium text-muted-foreground">City</label>
          <Input
            id="address-city"
            type="text"
            value={parts.city}
            onChange={(e) => updateField("city", e.target.value)}
            placeholder="e.g. Bronx"
            className="text-lg min-h-[48px]"
            disabled={disabled}
            data-testid="input-address-city"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="address-state" className="text-sm font-medium text-muted-foreground">State</label>
          <Select
            value={parts.state || "NY"}
            onValueChange={(val) => updateField("state", val)}
            disabled={disabled}
          >
            <SelectTrigger id="address-state" className="text-lg min-h-[48px]" data-testid="select-address-state">
              <SelectValue placeholder="NY" />
            </SelectTrigger>
            <SelectContent>
              {US_STATES.map((s) => (
                <SelectItem key={s} value={s} data-testid={`option-state-${s}`}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="address-zip" className="text-sm font-medium text-muted-foreground">ZIP Code</label>
        <Input
          id="address-zip"
          type="text"
          inputMode="numeric"
          value={parts.zip}
          onChange={(e) => updateField("zip", e.target.value.replace(/\D/g, "").slice(0, 5))}
          placeholder="e.g. 10451"
          className="text-lg min-h-[48px]"
          maxLength={5}
          disabled={disabled}
          data-testid="input-address-zip"
        />
      </div>
    </div>
  );
}
