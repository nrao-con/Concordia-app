export function PharmacistAvatar({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      className={`animate-gentle-float ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      data-testid="illustration-pharmacist"
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="56" fill="hsl(217 91% 60% / 0.12)" />
      <circle cx="60" cy="60" r="42" fill="hsl(217 91% 60% / 0.08)" />

      <circle cx="60" cy="38" r="16" fill="hsl(38 72% 85%)" />
      <circle cx="60" cy="36" r="14" fill="hsl(38 72% 88%)" />
      <ellipse cx="60" cy="28" rx="16" ry="8" fill="hsl(217 60% 40%)" />
      <ellipse cx="60" cy="26" rx="14" ry="6" fill="hsl(217 60% 50%)" />

      <circle cx="54" cy="36" r="2" fill="hsl(222 47% 20%)" />
      <circle cx="66" cy="36" r="2" fill="hsl(222 47% 20%)" />
      <circle cx="54" cy="35.5" r="0.8" fill="white" />
      <circle cx="66" cy="35.5" r="0.8" fill="white" />
      <path d="M56 42 Q60 45 64 42" stroke="hsl(38 60% 55%)" strokeWidth="1.5" strokeLinecap="round" fill="none" />

      <path d="M40 58 Q42 52 60 50 Q78 52 80 58 L82 90 Q82 96 76 96 L44 96 Q38 96 38 90 Z" fill="white" stroke="hsl(217 91% 78%)" strokeWidth="1" />
      <path d="M50 52 L50 70 L55 70" stroke="hsl(217 91% 60%)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M70 52 L70 70 L65 70" stroke="hsl(217 91% 60%)" strokeWidth="1.5" strokeLinecap="round" fill="none" />

      <rect x="54" y="60" width="12" height="12" rx="2" fill="hsl(217 91% 60% / 0.3)" stroke="hsl(217 91% 60%)" strokeWidth="1" />
      <path d="M60 63 L60 69 M57 66 L63 66" stroke="hsl(207 79% 44%)" strokeWidth="1.5" strokeLinecap="round" />

      <circle cx="38" cy="72" r="8" fill="hsl(38 72% 85%)" />
      <circle cx="82" cy="72" r="8" fill="hsl(38 72% 85%)" />

      <rect x="28" y="76" width="10" height="14" rx="4" fill="hsl(155 72% 36%)" />
      <rect x="30" y="78" width="6" height="6" rx="2" fill="hsl(155 72% 50%)" />
      <path d="M33 80 L33 83 M31.5 81.5 L34.5 81.5" stroke="white" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export function PillOrganizer({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      className={`animate-gentle-breathe ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      data-testid="illustration-pill-organizer"
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="56" fill="hsl(217 91% 60% / 0.1)" />

      <rect x="22" y="32" width="76" height="56" rx="8" fill="hsl(217 91% 95%)" stroke="hsl(217 91% 70%)" strokeWidth="1.5" />

      <rect x="22" y="32" width="76" height="14" rx="8" fill="hsl(217 91% 78%)" />
      <text x="35" y="42" fontSize="6" fill="hsl(222 47% 20%)" fontWeight="600" fontFamily="system-ui">M</text>
      <text x="48" y="42" fontSize="6" fill="hsl(222 47% 20%)" fontWeight="600" fontFamily="system-ui">T</text>
      <text x="60" y="42" fontSize="6" fill="hsl(222 47% 20%)" fontWeight="600" fontFamily="system-ui">W</text>
      <text x="72" y="42" fontSize="6" fill="hsl(222 47% 20%)" fontWeight="600" fontFamily="system-ui">T</text>
      <text x="84" y="42" fontSize="6" fill="hsl(222 47% 20%)" fontWeight="600" fontFamily="system-ui">F</text>

      <line x1="36" y1="46" x2="36" y2="88" stroke="hsl(217 91% 78% / 0.5)" strokeWidth="0.8" />
      <line x1="49" y1="46" x2="49" y2="88" stroke="hsl(217 91% 78% / 0.5)" strokeWidth="0.8" />
      <line x1="62" y1="46" x2="62" y2="88" stroke="hsl(217 91% 78% / 0.5)" strokeWidth="0.8" />
      <line x1="75" y1="46" x2="75" y2="88" stroke="hsl(217 91% 78% / 0.5)" strokeWidth="0.8" />

      <line x1="22" y1="66" x2="98" y2="66" stroke="hsl(217 91% 78% / 0.5)" strokeWidth="0.8" />

      <circle cx="29" cy="55" r="4" fill="hsl(38 72% 82%)" />
      <circle cx="42" cy="55" r="4" fill="hsl(155 55% 65%)" />
      <circle cx="55" cy="55" r="4" fill="hsl(215 25% 68%)" />
      <circle cx="68" cy="55" r="4" fill="hsl(38 72% 82%)" />
      <circle cx="81" cy="55" r="4" fill="hsl(217 91% 67%)" />

      <rect x="25" y="72" width="8" height="5" rx="2.5" fill="hsl(155 55% 65%)" />
      <rect x="39" y="72" width="8" height="5" rx="2.5" fill="hsl(38 72% 82%)" />
      <circle cx="55" cy="75" r="3.5" fill="hsl(217 91% 67%)" />
      <rect x="65" y="72" width="8" height="5" rx="2.5" fill="hsl(215 25% 68%)" />
      <circle cx="81" cy="75" r="3.5" fill="hsl(38 72% 82%)" />

      <circle cx="93" cy="30" r="10" fill="hsl(155 72% 36%)" />
      <path d="M89 30 L92 33 L98 27" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PackageDelivery({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      className={`animate-gentle-float ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      data-testid="illustration-package-delivery"
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="56" fill="hsl(207 79% 44% / 0.1)" />

      <path d="M30 50 L60 35 L90 50 L90 85 L60 100 L30 85 Z" fill="hsl(217 91% 85%)" stroke="hsl(207 79% 44%)" strokeWidth="1.5" />
      <path d="M30 50 L60 65 L90 50" stroke="hsl(207 79% 44%)" strokeWidth="1.5" />
      <path d="M60 65 L60 100" stroke="hsl(207 79% 44%)" strokeWidth="1.5" />

      <path d="M30 50 L60 65 L60 100 L30 85 Z" fill="hsl(217 91% 80%)" />
      <path d="M60 65 L90 50 L90 85 L60 100 Z" fill="hsl(217 91% 90%)" />

      <path d="M45 42.5 L75 57.5" stroke="hsl(207 79% 44% / 0.4)" strokeWidth="1" />
      <path d="M45 42.5 L45 60 L60 67.5" stroke="hsl(207 79% 44% / 0.3)" strokeWidth="1" />

      <rect x="52" y="48" width="16" height="10" rx="2" fill="hsl(217 91% 78%)" stroke="hsl(217 91% 60%)" strokeWidth="0.8" />
      <path d="M55 53 L60 50 L65 53" stroke="hsl(207 79% 44%)" strokeWidth="0.8" fill="none" />

      <circle cx="82" cy="32" r="14" fill="hsl(155 72% 36%)" />
      <path d="M76 32 L80 36 L88 28" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ShieldHeart({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      className={`animate-gentle-breathe ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      data-testid="illustration-shield-heart"
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="56" fill="hsl(217 91% 60% / 0.1)" />
      <circle cx="60" cy="60" r="42" fill="hsl(217 91% 60% / 0.06)" />

      <path
        d="M60 16 L26 32 L26 56 C26 78 40 96 60 104 C80 96 94 78 94 56 L94 32 Z"
        fill="hsl(217 91% 92%)"
        stroke="hsl(207 79% 50%)"
        strokeWidth="2"
      />
      <path
        d="M60 24 L32 38 L32 56 C32 74 44 90 60 96 C76 90 88 74 88 56 L88 38 Z"
        fill="hsl(217 91% 96%)"
      />

      <path d="M48 52 L54 52 L54 46 L66 46 L66 52 L72 52 L72 64 L66 64 L66 70 L54 70 L54 64 L48 64 Z" fill="hsl(155 72% 42%)" />
      <path d="M50 54 L56 54 L56 48 L64 48 L64 54 L70 54 L70 62 L64 62 L64 68 L56 68 L56 62 L50 62 Z" fill="hsl(155 72% 52%)" />

      <circle cx="42" cy="28" r="3" fill="hsl(217 91% 60% / 0.6)" />
      <circle cx="82" cy="24" r="2" fill="hsl(38 72% 82% / 0.6)" />
      <circle cx="90" cy="42" r="2.5" fill="hsl(155 55% 65% / 0.5)" />
    </svg>
  );
}

export function BellReminder({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      className={`animate-gentle-float ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      data-testid="illustration-bell-reminder"
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="56" fill="hsl(38 72% 82% / 0.1)" />

      <path
        d="M60 24 C60 24 44 24 40 44 C36 64 34 72 28 76 L92 76 C86 72 84 64 80 44 C76 24 60 24 60 24 Z"
        fill="hsl(38 72% 86%)"
        stroke="hsl(38 60% 55%)"
        strokeWidth="1.5"
      />
      <path
        d="M60 26 C60 26 46 26 42 44 C38 62 36 70 32 74 L88 74 C84 70 82 62 78 44 C74 26 60 26 60 26 Z"
        fill="hsl(38 72% 90%)"
      />
      <rect x="57" y="16" width="6" height="10" rx="3" fill="hsl(38 60% 55%)" />

      <ellipse cx="60" cy="88" rx="8" ry="5" fill="hsl(38 72% 82%)" stroke="hsl(38 60% 55%)" strokeWidth="1.5" />

      <circle cx="82" cy="34" r="14" fill="hsl(217 91% 78%)" stroke="hsl(217 91% 60%)" strokeWidth="1.5" />
      <text x="82" y="32" textAnchor="middle" fontSize="9" fill="hsl(222 47% 20%)" fontWeight="600" fontFamily="system-ui" dominantBaseline="central">
        9:00
      </text>
      <text x="82" y="41" textAnchor="middle" fontSize="6" fill="hsl(215 16% 47%)" fontFamily="system-ui" dominantBaseline="central">
        AM
      </text>

      <circle cx="28" cy="40" r="2" fill="hsl(217 91% 60% / 0.5)" />
      <circle cx="36" cy="28" r="1.5" fill="hsl(155 55% 65% / 0.5)" />
      <circle cx="92" cy="56" r="2" fill="hsl(38 72% 82% / 0.6)" />
    </svg>
  );
}

export function BlisterPackIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      className={`animate-gentle-breathe ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      data-testid="illustration-blister-pack"
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="56" fill="hsl(217 91% 60% / 0.1)" />
      <rect x="20" y="22" width="80" height="76" rx="10" fill="hsl(217 91% 95%)" stroke="hsl(207 79% 50%)" strokeWidth="1.5" />
      <rect x="20" y="22" width="80" height="16" rx="10" fill="hsl(217 91% 78%)" />
      <text x="60" y="33" textAnchor="middle" fontSize="8" fill="hsl(222 47% 15%)" fontWeight="700" fontFamily="system-ui" dominantBaseline="central">BLISTER PACK</text>
      <ellipse cx="38" cy="50" rx="7" ry="6" fill="hsl(155 55% 80%)" stroke="hsl(155 55% 50%)" strokeWidth="1" />
      <ellipse cx="60" cy="50" rx="7" ry="6" fill="hsl(38 72% 85%)" stroke="hsl(38 60% 55%)" strokeWidth="1" />
      <ellipse cx="82" cy="50" rx="7" ry="6" fill="hsl(217 91% 80%)" stroke="hsl(217 91% 55%)" strokeWidth="1" />
      <ellipse cx="38" cy="68" rx="7" ry="6" fill="hsl(215 25% 75%)" stroke="hsl(215 25% 50%)" strokeWidth="1" />
      <ellipse cx="60" cy="68" rx="7" ry="6" fill="hsl(155 55% 80%)" stroke="hsl(155 55% 50%)" strokeWidth="1" />
      <ellipse cx="82" cy="68" rx="7" ry="6" fill="hsl(38 72% 85%)" stroke="hsl(38 60% 55%)" strokeWidth="1" />
      <ellipse cx="38" cy="86" rx="7" ry="6" fill="hsl(217 91% 80%)" stroke="hsl(217 91% 55%)" strokeWidth="1" />
      <ellipse cx="60" cy="86" rx="7" ry="6" fill="hsl(215 25% 75%)" stroke="hsl(215 25% 50%)" strokeWidth="1" />
      <ellipse cx="82" cy="86" rx="7" ry="6" fill="hsl(155 55% 80%)" stroke="hsl(155 55% 50%)" strokeWidth="1" />
      <circle cx="38" cy="50" r="2" fill="white" opacity="0.6" />
      <circle cx="60" cy="50" r="2" fill="white" opacity="0.6" />
      <circle cx="82" cy="50" r="2" fill="white" opacity="0.6" />
      <circle cx="38" cy="68" r="2" fill="white" opacity="0.6" />
      <circle cx="60" cy="68" r="2" fill="white" opacity="0.6" />
      <circle cx="82" cy="68" r="2" fill="white" opacity="0.6" />
      <circle cx="38" cy="86" r="2" fill="white" opacity="0.6" />
      <circle cx="60" cy="86" r="2" fill="white" opacity="0.6" />
      <circle cx="82" cy="86" r="2" fill="white" opacity="0.6" />
    </svg>
  );
}

export function BlisterPackSidebarIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="3" y="2" width="18" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <ellipse cx="8.5" cy="7.5" rx="2.5" ry="2" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1" />
      <ellipse cx="15.5" cy="7.5" rx="2.5" ry="2" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1" />
      <ellipse cx="8.5" cy="13" rx="2.5" ry="2" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1" />
      <ellipse cx="15.5" cy="13" rx="2.5" ry="2" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1" />
      <ellipse cx="8.5" cy="18.5" rx="2.5" ry="2" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1" />
      <ellipse cx="15.5" cy="18.5" rx="2.5" ry="2" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function TypingDots({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`} data-testid="typing-indicator" role="status" aria-label="Assistant is typing">
      <span className="sr-only">Assistant is typing</span>
      <span className="w-2.5 h-2.5 rounded-full bg-primary/50 animate-typing-dot" aria-hidden="true" />
      <span className="w-2.5 h-2.5 rounded-full bg-primary/50 animate-typing-dot" aria-hidden="true" style={{ animationDelay: "0.2s" }} />
      <span className="w-2.5 h-2.5 rounded-full bg-primary/50 animate-typing-dot" aria-hidden="true" style={{ animationDelay: "0.4s" }} />
    </div>
  );
}

export function ShimmerOrb({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      data-testid="shimmer-orb"
      role="status"
      aria-label="Assistant is thinking"
    >
      <span className="sr-only">Assistant is thinking</span>
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full animate-shimmer-orb-outer" aria-hidden="true" />
        <div className="absolute inset-1.5 rounded-full animate-shimmer-orb-inner" aria-hidden="true" />
        <div className="absolute inset-3 rounded-full bg-primary/20 animate-shimmer-orb-core" aria-hidden="true" />
      </div>
    </div>
  );
}
