import { useState, useRef, useEffect } from "react";
import { api, setTokens } from "../api/client.js";
import { T, FONT } from "../theme.js";
import { useCloudinaryUpload } from "../hooks/useCloudinaryUpload";
import { openGoogleAuthPopup } from "../lib/googleAuthPopup";

/** Minimal photo uploader used only inside the shop registration step */
function ShopPhotoUploader({ photoUrl, onUploaded }: { photoUrl: string; onUploaded: (url: string) => void }) {
  const { upload, uploading, progress } = useCloudinaryUpload();
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");
  const handle = async (file: File) => {
    if (!file.type.startsWith("image/")) { setErr("Please select an image file"); return; }
    if (file.size > 10 * 1024 * 1024) { setErr("File too large — max 10 MB"); return; }
    setErr("");
    try { const r = await upload(file, "shops"); onUploaded(r.secureUrl); }
    catch { setErr("Upload failed — please try again"); }
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <div onClick={() => !uploading && ref.current?.click()}
        style={{ height: 100, border: `2px dashed ${photoUrl ? "#22c55e" : "#3F3F46"}`, borderRadius: 10, background: "#16171e", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
        {photoUrl
          ? <img src={photoUrl} alt="Shop" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ textAlign: "center", color: "#6b6b75" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#6b6b75" }}>photo_camera</span>
              <div style={{ fontSize: 12, marginTop: 4 }}>Upload shop photo</div>
            </div>}
        {uploading && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <div style={{ width: 100, height: 4, background: "#2e2f3a", borderRadius: 4 }}>
              <div style={{ width: `${progress}%`, height: "100%", background: "#BE2B1A", borderRadius: 4, transition: "width 0.1s" }} />
            </div>
            <span style={{ fontSize: 11, color: "#fff" }}>Uploading {progress}%</span>
          </div>
        )}
      </div>
      {err && <div style={{ fontSize: 12, color: "#DC2626", marginTop: 4 }}>{err}</div>}
      {photoUrl && <div style={{ fontSize: 11, color: "#22c55e", marginTop: 4 }}>✓ Photo uploaded</div>}
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handle(f); e.target.value = ""; }} />
    </div>
  );
}

/**
 * AUTH FLOW — email + password only:
 *
 * SIGN IN (existing users)
 *   → Email + Password → login
 *   → If email never verified → OTP screen (resent automatically) before entry
 *   → Forgot password → reset link
 *   → If shop owner PENDING/REJECTED → show status screen
 *
 * CREATE ACCOUNT (new users)
 *   → Pick role (Shop Owner / Customer)
 *   → Email + Password
 *   → Verify the 6-digit code emailed to them (REG_VERIFY_EMAIL) — required,
 *     since this is the one signup path where we haven't already had a
 *     third party (Google) vouch for the address
 *   → Shop Owner: Shop Details form → PENDING screen
 *   → Customer: Name → Marketplace
 *
 * Google sign-in skips OTP entirely — the backend marks emailVerified=true
 * for those accounts at creation, since Google already verified the address.
 */

const STEPS = {
  LANDING:          "landing",          // Sign In / Create Account choice
  SIGNIN:           "signin",           // Sign-in form (email + password)
  REG_ROLE:         "reg_role",         // Role selection for new users
  REG_AUTH:         "reg_auth",         // Email registration form
  VERIFY_EMAIL:     "verify_email",     // 6-digit code sent to the email just entered/signed-in-with
  SHOP_DETAILS:     "shop_details",     // Shop info form (new shop owners)
  PROFILE:          "profile",          // Name setup (new customers)
  MECHANIC_DETAILS: "mechanic_details", // Name/phone/shop details for new independent mechanics
  PENDING:          "pending",          // Shop owner awaiting approval
  REJECTED:         "rejected",         // Shop owner rejected
  ADMIN_AUTH:       "admin_auth",       // Admin email+password login
};

// ─── Error message helper ─────────────────────────────────────────────────────
const INFRA_ERR_PATTERNS = [
  "connection is closed",
  "connection refused",
  "connection timed out",
  "econnrefused",
  "econnreset",
  "etimedout",
  "prisma",
  "redis",
  "max requests limit",
  "socket hang up",
  "network socket disconnected",
];
function isInfraErr(msg: string) {
  const lower = msg.toLowerCase();
  return INFRA_ERR_PATTERNS.some((p) => lower.includes(p));
}
function getErr(e: unknown, fallback = "Something went wrong. Please try again."): string {
  const candidates = [
    (e as any)?.data?.error?.message,
    typeof (e as any)?.data?.error === "string" ? (e as any)?.data?.error : null,
    (e as any)?.data?.message,
    (e as any)?.message && (e as any).message !== "Request failed" ? (e as any).message : null,
  ];
  for (const msg of candidates) {
    if (typeof msg === "string" && msg) {
      if (isInfraErr(msg)) return "Service temporarily unavailable. Please try again in a moment.";
      return msg;
    }
  }
  return fallback;
}

// ─── CSS — fonts already loaded from index.html, no @import needed ───────────
const css = `
  @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
  @keyframes auth-pulse { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
  @keyframes auth-spin { to { transform: rotate(360deg); } }
  .auth-spinner { display:inline-block; width:22px; height:22px; border:2.5px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:auth-spin 0.75s linear infinite; flex-shrink:0; }
  .auth-spinner-dark { display:inline-block; width:22px; height:22px; border:2.5px solid rgba(26,18,5,0.15); border-top-color:#9C8C7C; border-radius:50%; animation:auth-spin 0.75s linear infinite; flex-shrink:0; }
  .auth-card { animation: fadeUp 0.28s cubic-bezier(0.16,1,0.3,1); }
  .auth-input:focus { border-color: #be2b1a !important; box-shadow: 0 0 0 2px rgba(190,43,26,0.18) !important; outline: none !important; }
  .admin-input:focus { border-color: #7C3AED !important; box-shadow: 0 0 0 2px rgba(124,58,237,0.2) !important; }
  .btn-primary:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 10px 30px rgba(190,43,26,0.4) !important; }
  .btn-primary:active:not(:disabled) { transform: translateY(0); }
  .role-card:hover { border-color: rgba(190,43,26,0.5) !important; background: rgba(190,43,26,0.06) !important; }
  .role-card.selected { border-color: #be2b1a !important; background: rgba(190,43,26,0.08) !important; box-shadow: 0 0 0 2px rgba(190,43,26,0.18) !important; }
  .tab-btn { transition: all 0.18s; }
  .tab-btn.active { background: rgba(190,43,26,0.08) !important; color: #be2b1a !important; border-bottom: 2px solid #be2b1a !important; }
  .stitch-tab-active { background: #FAF6F0 !important; color: #1A1205 !important; border: 1px solid #E0D5C8 !important; }
  .stitch-tab-inactive { background: transparent !important; color: #9C8C7C !important; border: 1px solid transparent !important; }
  .stitch-tab-inactive:hover { color: #5C4F40 !important; }
  .btn-outline-stitch:hover { background: #F0E8DF !important; }
  /* Left panel hero overlay */
  .auth-left-content { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:space-between; padding:48px; }
  .auth-left-overlay { position:absolute; inset:0; background:linear-gradient(0deg,rgba(18,20,22,0.94) 0%,rgba(18,20,22,0.3) 100%); }
  /* Left panel: hide on small screens */
  @media (max-width: 900px) {
    .auth-hero-left { display: none !important; }
    .auth-form-right { width: 100% !important; }
  }
  @media (max-width: 540px) {
    .auth-form-right { padding: 32px 20px 40px !important; }
  }
  @media (max-width: 380px) {
    .auth-form-right { padding: 28px 16px 36px !important; }
  }
  /* Footer */
  .auth-footer-link { color: #5C4F40; text-decoration: none; transition: color 0.18s; }
  .auth-footer-link:hover { color: #BE2B1A !important; }
  .auth-footer-social:hover { border-color: #BE2B1A !important; color: #BE2B1A !important; }
  @media (max-width: 900px) {
    .auth-footer-grid { grid-template-columns: 1fr 1fr !important; }
  }
  @media (max-width: 540px) {
    .auth-footer-grid { grid-template-columns: 1fr !important; }
    .auth-footer { padding: 40px 24px 28px !important; }
  }
`;

// ─── Shared style tokens (light cream palette) ────────────────────────────────
const BASE_S = {
  label:  { fontSize: 11, fontWeight: 700, color: "#9C8C7C", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "block", fontFamily: "'Inter', sans-serif" },
  input:  { width: "100%", background: "#FFFFFF", border: "1.5px solid #E0D5C8", borderRadius: 8, padding: "12px 14px", color: "#1A1205", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "'Inter', sans-serif", transition: "border 0.18s, box-shadow 0.18s" },
  phoneRow: { display: "flex", alignItems: "stretch", border: "1.5px solid #E0D5C8", borderRadius: 8, overflow: "hidden", background: "#FFFFFF" },
  phoneFlag: { padding: "12px 14px", background: "#FAF6F0", color: "#5C4F40", fontSize: 13, fontWeight: 500, borderRight: "1px solid #E0D5C8", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontFamily: "'Inter', sans-serif" },
  phoneInput: { flex: 1, background: "transparent", border: "none", outline: "none", color: "#1A1205", fontSize: 15, padding: "12px 14px", fontFamily: "'Inter', sans-serif", letterSpacing: "0.08em" },
  btnPrimary: (disabled) => ({ width: "100%", padding: "14px", background: disabled ? "#E0D5C8" : "#BE2B1A", color: disabled ? "#9C8C7C" : "#FFFFFF", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "'Inter', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", transition: "all 0.2s", boxShadow: disabled ? "none" : "0 8px 24px rgba(190,43,26,0.25)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }),
  btnOutline: { width: "100%", padding: "13px", background: "transparent", border: "1.5px solid #E0D5C8", borderRadius: 8, color: "#5C4F40", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Inter', sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  btnGoogle: { width: "100%", padding: "13px", background: "#fff", border: "1.5px solid #E0D5C8", borderRadius: 8, color: "#1A1205", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontFamily: "'Inter', sans-serif" },
  btnBack: { background: "none", border: "none", color: "#9C8C7C", cursor: "pointer", fontSize: 13, padding: "0 0 20px", display: "flex", alignItems: "center", gap: 5, fontFamily: "'Inter', sans-serif" },
  otpRow: { display: "flex", gap: 8, marginBottom: 20, justifyContent: "center" },
  otpBox: { width: 46, height: 54, textAlign: "center", fontSize: 22, fontWeight: 700, fontFamily: "'Inter', sans-serif", background: "#FFFFFF", border: "1.5px solid #E0D5C8", borderRadius: 8, color: "#1A1205", outline: "none" },
  error: { background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "11px 14px", color: "#BE2B1A", fontSize: 13, marginBottom: 16, lineHeight: 1.5 },
  divider: { display: "flex", alignItems: "center", gap: 12, margin: "20px 0" },
  dividerLine: { flex: 1, height: 1, background: "#E0D5C8" },
  dividerText: { color: "#9C8C7C", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Inter', sans-serif" },
  heading: { fontSize: 22, fontWeight: 800, color: "#1A1205", marginBottom: 6, letterSpacing: "-0.2px", fontFamily: "'Plus Jakarta Sans', sans-serif" },
  sub: { fontSize: 14, color: "#9C8C7C", marginBottom: 24, lineHeight: 1.55 },
  chip: { fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "#BE2B1A", marginBottom: 8, fontFamily: "'Inter', sans-serif" },
  hint: { fontSize: 12, color: "#9C8C7C", lineHeight: 1.6, marginBottom: 16 },
  fieldErr: { fontSize: 11, color: "#DC2626", fontWeight: 600, marginBottom: 10 },
};

// Red border + glow to apply to a field's style object when it failed validation on submit.
const errStyle = (invalid) => invalid ? { border: "1.5px solid #DC2626", boxShadow: "0 0 0 3px rgba(220,38,38,0.13)" } : {};

// ─── Indian states for shop registration ─────────────────────────────────────
const INDIA_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat",
  "Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh",
  "Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab",
  "Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand",
  "West Bengal","Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu",
  "Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry",
];

// ─── Left branding panel content ─────────────────────────────────────────────
const FEATURES = [
  { icon: "receipt_long", title: "GST billing in seconds", desc: "Multi-tender invoices with WhatsApp delivery" },
  { icon: "inventory_2", title: "Live inventory & stock alerts", desc: "Immutable ledger — every movement tracked" },
  { icon: "handshake", title: "Udhaar / credit tracking", desc: "Digital khata — automated reminders" },
  { icon: "search", title: "Fitment-guaranteed search", desc: "Parts guaranteed to fit your exact vehicle" },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function LoginPage({ onLogin, isModal = false, initialStep = STEPS.LANDING }) {
  const [step, setStep]           = useState(initialStep);
  const [role, setRole]           = useState("customer"); // "shop" | "customer" | "admin"
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd]     = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [settingUp, setSettingUp] = useState(false); // overlay while transitioning to shop-details
  const [error, setError]         = useState("");
  const [shopDetails, setShopDetails] = useState({ ownerName: "", shopName: "", address: "", city: "Hyderabad", state: "Telangana", pincode: "", contactPhone: "", email: "", gstin: "", shopCategory: "", businessType: "", whatsappNumber: "", photoUrl: "" });
  const [shopFieldErrors, setShopFieldErrors] = useState<Record<string, boolean>>({});
  const [vehicle, setVehicle] = useState({ make: "", model: "", year: "", fuelType: "", registrationNo: "" });
  const [profile, setProfile]     = useState({ name: "", profileType: "INDIVIDUAL" });
  const [pendingUserId, setPendingUserId] = useState(null);
  const [pendingUser, setPendingUser]     = useState(null); // for profile step
  const [resumeNotice, setResumeNotice]   = useState("");   // "welcome back, finish setup" banner
  const [rejectionMsg, setRejectionMsg]   = useState("");
  const [forgotEmail, setForgotEmail]     = useState("");
  const [forgotMode, setForgotMode]       = useState(false);

  const [forgotSent, setForgotSent]       = useState(false);
  const [landingTab, setLandingTab]       = useState("customer"); // "owner" | "customer" | "mechanic"
  const landingTabRef = useRef("customer");
  useEffect(() => { landingTabRef.current = landingTab; }, [landingTab]);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [roleMismatch, setRoleMismatch]   = useState<{ user: any } | null>(null);
  const [hideGoogleForMechanic, setHideGoogleForMechanic] = useState(false);
  const [mechDetails, setMechDetails]     = useState({ name: "", phone: "", shopName: "", shopLocation: "" });

  // ── Email OTP verification (manual signup/login only — Google is pre-verified) ──
  const [otpCode, setOtpCode]             = useState("");
  const [otpError, setOtpError]           = useState("");
  const [otpVerifying, setOtpVerifying]   = useState(false);
  const [otpResending, setOtpResending]   = useState(false);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  // What to do once the code checks out — set right before go(STEPS.VERIFY_EMAIL)
  const [afterVerify, setAfterVerify]     = useState(null);

  // Modal-responsive style tokens — shadow module-level BASE_S.
  // The modal panel is large (≈1000×660), so keep type/controls near full
  // size for readability; only trim a little vs the standalone page.
  // True only for admin.app.redpiston (the only caller that ever passes this
  // initialStep) — swaps the shared hero panel's marketplace copy for
  // admin-console copy and retints the sign-in card violet. See LoginPage's
  // callers: red-piston-frontend/red-piston-shop never pass ADMIN_AUTH.
  const isAdminEntry = initialStep === STEPS.ADMIN_AUTH;

  const S = isModal ? {
    ...BASE_S,
    // Full-screen login → a deliberate, generous type scale (Plus Jakarta hero,
    // Inter body, JetBrains Mono labels): Hero 28 / Sub 15 / Body 15 / Label 11.
    heading:   { ...BASE_S.heading, fontSize: 28, marginBottom: 6, letterSpacing: "-0.4px", lineHeight: 1.15 },
    sub:       { ...BASE_S.sub, fontSize: 15, marginBottom: 24, lineHeight: 1.5 },
    chip:      { ...BASE_S.chip, fontSize: 11, marginBottom: 10, letterSpacing: "0.12em" },
    label:     { ...BASE_S.label, fontSize: 11, marginBottom: 7 },
    hint:      { ...BASE_S.hint, fontSize: 13, marginBottom: 14 },
    input:     { ...BASE_S.input, padding: "10px 13px", fontSize: 14 },
    phoneFlag: { ...BASE_S.phoneFlag, padding: "10px 13px", fontSize: 14 },
    phoneInput:{ ...BASE_S.phoneInput, padding: "10px 13px", fontSize: 14 },
    btnPrimary:(d) => ({ ...BASE_S.btnPrimary(d), padding: "12px", fontSize: 13 }),
    btnOutline:{ ...BASE_S.btnOutline, padding: "11px", fontSize: 13 },
    btnGoogle: { ...BASE_S.btnGoogle, padding: "11px", fontSize: 13 },
    btnBack:   { ...BASE_S.btnBack, padding: "0 0 14px", fontSize: 13 },
    otpBox:    { ...BASE_S.otpBox, width: 46, height: 52, fontSize: 20 },
    error:     { ...BASE_S.error, padding: "10px 13px", fontSize: 13, marginBottom: 12 },
    divider:   { ...BASE_S.divider, margin: "14px 0" },
  } : BASE_S;

  const go = (s) => { setStep(s); setError(""); };
  const back = (s) => { setStep(s); setError(""); };

  // ── Email OTP verification (manual signup/login only) ─────────────────────
  // Google-authenticated accounts are marked emailVerified server-side at
  // creation and never pass through here — see googleLogin below.
  const goVerifyEmail = (onVerified, { autoResend = false } = {}) => {
    setOtpCode(""); setOtpError(""); setOtpResendCooldown(0);
    setAfterVerify(() => onVerified);
    go(STEPS.VERIFY_EMAIL);
    if (autoResend) resendOtp();
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(otpCode)) { setOtpError("Enter the 6-digit code"); return; }
    setOtpError(""); setOtpVerifying(true);
    try {
      await api.post("/api/auth/verify-email", { email, code: otpCode });
      setOtpVerifying(false);
      afterVerify?.();
    } catch (e) {
      setOtpVerifying(false);
      setOtpError(getErr(e, "Invalid or expired code. Try again."));
    }
  };

  const resendOtp = async () => {
    if (otpResendCooldown > 0) return;
    setOtpResending(true); setOtpError("");
    try {
      await api.post("/api/auth/resend-verification", { email });
      setOtpResendCooldown(30);
    } catch (e) {
      setOtpError(getErr(e, "Could not resend code. Try again."));
    }
    setOtpResending(false);
  };

  useEffect(() => {
    if (otpResendCooldown <= 0) return;
    const t = setTimeout(() => setOtpResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [otpResendCooldown]);

  // ── Handle backend response (shared across all auth methods) ──────────────
  const handleAuthResponse = (data) => {
    // Shop owner needing shop details (new registration OR resumed after abandoning).
    // The backend now issues tokens here — /shop-setup requires a Bearer token.
    if (data?.needsShopDetails) {
      if (data.accessToken) setTokens(data.accessToken, data.refreshToken);
      setPendingUserId(data.userId);
      setShopDetails(d => ({
        ...d,
        ownerName:    data.userName || d.ownerName,
        contactPhone: data.phone || d.contactPhone,
        email:        data.email || email || d.email,
      }));
      setResumeNotice("");
      go(STEPS.SHOP_DETAILS);
      return;
    }
    // Existing PENDING shop owner trying to login
    if (data?.pending) { go(STEPS.PENDING); return; }

    const userData    = data?.data?.user || data?.user;
    const accessToken = data?.data?.accessToken || data?.accessToken;
    const refreshToken = data?.refreshToken;
    const isNewUser   = data?.data?.isNewUser ?? data?.isNewUser;

    if (!userData) throw new Error("Server returned an unexpected response.");

    setTokens(accessToken, refreshToken);

    // Role mismatch: user selected mechanic tab but existing account is a different role
    // Skip for admin roles — they can access any tab
    if (landingTab === "mechanic" && userData.role && userData.role !== "MECHANIC" && userData.role !== "PLATFORM_ADMIN" && userData.role !== "ADMIN") {
      setPendingUser(userData);
      setRoleMismatch({ user: userData });
      return;
    }

    if ((isNewUser || !userData.name || !userData.phone) && userData.role === "MECHANIC") {
      // New mechanic or returning mechanic who never completed details (phone/shop missing)
      setPendingUser(userData);
      go(STEPS.MECHANIC_DETAILS);
    } else if ((isNewUser || !userData.name) && userData.role === "CUSTOMER") {
      // New customer — or returning customer who never finished the name step
      setPendingUser(userData);
      if (userData.name) setProfile(p => ({ ...p, name: userData.name }));
      setResumeNotice(isNewUser ? "" : "Welcome back! Just tell us your name to finish setting up your account.");
      go(STEPS.PROFILE);
    } else {
      // Existing user (or new shop owner already handled above)
      localStorage.setItem("as_user", JSON.stringify(userData));
      onLogin(userData);
    }
  };

  // ── Sign-in via email + password ───────────────────────────────────────────
  const emailSignIn = async () => {
    if (!email || !password) { setError("Enter both email and password"); return; }
    setError(""); setLoading(true);
    try {
      const data = await api.post("/api/auth/login", { email, password });

      // Shop owner who abandoned signup — resume the shop-details step
      if (data?.needsShopDetails) {
        handleAuthResponse(data);
        setLoading(false);
        return;
      }

      const userData = data?.user;
      if (!userData) throw new Error("Server returned an unexpected response.");
      setTokens(data.accessToken, data.refreshToken);

      const proceedPastEmailCheck = () => {
        // Mechanic who never finished profile setup
        if (!userData.name && userData.role === "MECHANIC") {
          setPendingUser(userData);
          go(STEPS.MECHANIC_DETAILS);
          return;
        }
        // Customer who never finished the name step — resume it
        if (!userData.name && userData.role === "CUSTOMER") {
          setPendingUser(userData);
          setResumeNotice("Welcome back! Just tell us your name to finish setting up your account.");
          go(STEPS.PROFILE);
          return;
        }
        localStorage.setItem("as_user", JSON.stringify(userData));
        onLogin(userData);
      };

      // Signed up manually, never verified the email — this is the one signup
      // path with no third party vouching for the address, so we don't let it
      // sit unverified indefinitely. Login itself doesn't send a fresh code,
      // so fire one now (autoResend).
      if (!userData.emailVerified) {
        setLoading(false);
        goVerifyEmail(() => { userData.emailVerified = true; proceedPastEmailCheck(); }, { autoResend: true });
        return;
      }

      proceedPastEmailCheck();
    } catch (e) {
      const code = e.data?.error?.code;
      if (code === "NO_ACCOUNT") { setError("No account found with this email. Please create an account first."); setLoading(false); return; }
      if (code === "SHOP_OWNER_PENDING")  { go(STEPS.PENDING);  return; }
      if (code === "SHOP_OWNER_REJECTED") { setRejectionMsg(e.data?.error?.message || ""); go(STEPS.REJECTED); return; }
      setError(getErr(e, "Login failed. Check your credentials."));
    }
    setLoading(false);
  };

  // ── Register via email + password ──────────────────────────────────────────
  const emailRegister = async () => {
    if (!email) { setError("Enter your email address"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Enter a valid email"); return; }
    if (!password || password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirmPwd) { setError("Passwords do not match"); return; }
    setError(""); setLoading(true);
    try {
      const vehiclePayload = vehicle.make && vehicle.model && vehicle.year ? vehicle : undefined;
      const data = await api.post("/api/auth/register", { email, password, role, name: profile.name || undefined, vehicle: vehiclePayload });
      setLoading(false);
      // /register already sent the first OTP — no need to fire another.
      if (data?.needsShopDetails) {
        goVerifyEmail(() => {
          setSettingUp(true);
          handleAuthResponse(data); // stores tokens + prefills + goes to SHOP_DETAILS
          setTimeout(() => setSettingUp(false), 500);
        });
        return;
      }
      const userData = data?.user;
      if (!userData) throw new Error("Server returned an unexpected response.");
      setTokens(data.accessToken, data.refreshToken);
      setPendingUser(userData);
      goVerifyEmail(() => go(STEPS.PROFILE));
    } catch (e) {
      const code = e.data?.error?.code;
      if (code === "EMAIL_EXISTS") {
        setError("An account with this email already exists. Please sign in instead — if your registration was incomplete, you'll resume right where you left off.");
        return setLoading(false);
      }
      setError(getErr(e, "Registration failed. Try again."));
    }
    setLoading(false);
  };

  // ── Step 1: validate email/password, collect details next ────────────────
  const emailRegisterMechanic = () => {
    if (!email) { setError("Enter your email address"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Enter a valid email"); return; }
    if (!password || password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirmPwd) { setError("Passwords do not match"); return; }
    setError("");
    go(STEPS.MECHANIC_DETAILS);
  };

  // ── Step 2: submit mechanic details ──────────────────────────────────────
  // Google/existing-user path: pendingUser already has userId → just PATCH profile
  // Email registration path: no userId yet → register + send OTP → verify email
  const submitMechanicRegistration = async () => {
    if (!mechDetails.name.trim()) { setError("Enter your name"); return; }
    if (!mechDetails.phone.trim()) { setError("Enter your mobile number"); return; }
    setError(""); setLoading(true);

    if ((pendingUser as any)?.userId) {
      // Already authenticated (Google or existing sign-in) — update profile, then verify email
      try {
        const res = await api.patch("/api/mechanic/profile/setup", {
          name: mechDetails.name.trim(),
          phone: mechDetails.phone.trim(),
          shopName: mechDetails.shopName.trim(),
          shopLocation: mechDetails.shopLocation.trim(),
        });
        const user = { ...(pendingUser || {}), name: mechDetails.name.trim(), role: "MECHANIC", ...(res as any)?.data };
        // Force OTP verification regardless of prior emailVerified state
        await api.post("/api/mechanic-auth/send-otp", {});
        setEmail((pendingUser as any)?.email || "");
        goVerifyEmail(() => {
          localStorage.setItem("as_user", JSON.stringify(user));
          onLogin(user);
        });
      } catch (e) { setError(getErr(e, "Could not save details. Try again.")); }
      setLoading(false);
      return;
    }

    // Email registration: register account + send OTP
    try {
      const data = await api.post("/api/mechanic-auth/register-independent", {
        email, password,
        name: mechDetails.name.trim(),
        phone: mechDetails.phone.trim(),
        shopName: mechDetails.shopName.trim(),
        shopLocation: mechDetails.shopLocation.trim(),
      });
      setTokens(data.accessToken, data.refreshToken);
      setPendingUser(data.user);
      goVerifyEmail(() => {
        const user = { ...(data.user || {}), name: mechDetails.name.trim(), role: "MECHANIC" };
        localStorage.setItem("as_user", JSON.stringify(user));
        onLogin(user);
      });
    } catch (e) {
      const code = (e as any).data?.error?.code;
      if (code === "EMAIL_EXISTS") setError("An account with this email already exists. Sign in instead.");
      else setError(getErr(e, "Registration failed. Try again."));
    }
    setLoading(false);
  };

  // ── Submit shop details → POST /api/auth/shop-setup ───────────────────────
  const submitShopDetails = async () => {
    const pin = shopDetails.pincode.replace(/\D/g, "");
    const ph = shopDetails.contactPhone.replace(/\D/g, "");
    const wa = shopDetails.whatsappNumber.replace(/\D/g, "");
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shopDetails.email.trim());
    const errs = {
      ownerName: !shopDetails.ownerName.trim(),
      shopName: !shopDetails.shopName.trim(),
      address: !shopDetails.address.trim(),
      city: !shopDetails.city.trim(),
      state: !shopDetails.state,
      pincode: pin.length !== 6,
      contactPhone: ph.length !== 10,
      businessType: !shopDetails.businessType,
      // Only relevant to a shop that actually sells parts — a decor/services-only
      // shop has no parts taxonomy to pick.
      shopCategory: shopDetails.businessType !== "SERVICES" && !shopDetails.shopCategory,
      whatsappNumber: wa.length !== 10,
      email: !shopDetails.email.trim() || !emailValid,
      gstin: shopDetails.gstin.length !== 15,
      photoUrl: !shopDetails.photoUrl,
    };
    if (Object.values(errs).some(Boolean)) {
      setShopFieldErrors(errs);
      setError("Please fix the highlighted fields below.");
      return;
    }
    setShopFieldErrors({});
    setError(""); setLoading(true);
    try {
      await api.post("/api/auth/shop-setup", {
        userId:          pendingUserId,
        ownerName:       shopDetails.ownerName.trim(),
        shopName:        shopDetails.shopName.trim(),
        address:         shopDetails.address.trim(),
        city:            shopDetails.city.trim(),
        state:           shopDetails.state,
        pincode:         pin,
        contactPhone:    ph,
        email:           shopDetails.email.trim() || undefined,
        gstin:           shopDetails.gstin.trim() || undefined,
        shopCategory:    shopDetails.businessType !== "SERVICES" ? (shopDetails.shopCategory || undefined) : undefined,
        businessType:    shopDetails.businessType || "BOTH",
        whatsappNumber:  shopDetails.whatsappNumber.replace(/\D/g,"") || undefined,
        photoUrl:        shopDetails.photoUrl || undefined,
      });
      go(STEPS.PENDING);
    } catch (e) { setError(getErr(e, "Could not submit shop details. Try again.")); }
    setLoading(false);
  };

  // ── Save customer profile name ─────────────────────────────────────────────
  const saveProfile = async () => {
    if (!profile.name.trim()) { setError("Enter your name"); return; }
    setError(""); setLoading(true);
    try {
      const res = await api.patch("/api/auth/me", { name: profile.name.trim(), profileType: profile.profileType });
      const user = { ...pendingUser, name: (res?.data || res)?.name || profile.name.trim() };
      localStorage.setItem("as_user", JSON.stringify(user));
      onLogin(user);
    } catch (e) { setError(getErr(e, "Could not save name. Try again.")); }
    setLoading(false);
  };

  // ── Admin email login ──────────────────────────────────────────────────────
  const adminSignIn = async () => {
    if (!email || !password) { setError("Enter both email and password"); return; }
    setError(""); setLoading(true);
    try {
      const data = await api.post("/api/auth/login", { email, password });
      const userData = data?.user;
      if (!userData) throw new Error("Unexpected response.");
      if (userData.role !== "PLATFORM_ADMIN" && userData.userType?.slug !== "PLATFORM_ADMIN") {
        setError("Access denied. This console is for platform admins only.");
        setLoading(false); return;
      }
      setTokens(data.accessToken, data.refreshToken);
      localStorage.setItem("as_user", JSON.stringify(userData));
      onLogin(userData);
    } catch (e) { setError(getErr(e, "Login failed.")); }
    setLoading(false);
  };

  // ── Admin Google sign-in ─────────────────────────────────────────────────────
  // Deliberately its own function, not the shared googleAuth()/handleAuthResponse()
  // used by the customer/shop/mechanic tabs: those happily create a brand-new
  // account on first Google sign-in. An admin account must already exist — Google
  // here is just an alternate credential for an EXISTING PLATFORM_ADMIN, so a
  // new-user result is treated as a denial, not onboarded.
  const adminGoogleSignIn = async () => {
    setError(""); setGoogleLoading(true);
    try {
      const accessToken = await openGoogleAuthPopup();
      const data = await api.post("/api/auth/google", { accessToken, role: "customer" });
      const userData = data?.user;
      if (!userData) throw new Error("Unexpected response.");
      if (data?.isNewUser || (userData.role !== "PLATFORM_ADMIN" && userData.userType?.slug !== "PLATFORM_ADMIN")) {
        setError("Access denied. This console is for platform admins only.");
        setGoogleLoading(false); return;
      }
      setTokens(data.accessToken, data.refreshToken);
      localStorage.setItem("as_user", JSON.stringify(userData));
      onLogin(userData);
    } catch (e: any) {
      if (e?.message === "popup_closed") { /* user cancelled — not an error */ }
      else if (e?.message === "popup_blocked") setError("Please allow popups for this site and try again.");
      else setError(getErr(e, "Google sign-in failed. Try again."));
    }
    setGoogleLoading(false);
  };

  // ── Forgot password ────────────────────────────────────────────────────────
  const sendForgotPassword = async () => {
    if (!forgotEmail) { setError("Enter your email"); return; }
    setError(""); setLoading(true);
    try {
      await api.post("/api/auth/forgot-password", { email: forgotEmail });
      setForgotSent(true);
    } catch (e) {
      const code = e.data?.error?.code;
      if (code === "USER_NOT_FOUND") {
        setError("No account found with this email. Please create an account first.");
      } else {
        setError(getErr(e, "Could not send reset link. Try again."));
      }
    }
    setLoading(false);
  };

  // ── Google Sign-In ─────────────────────────────────────────────────────────
  const googleAuth = async (_intent: string) => {
    setError(""); setGoogleLoading(true);
    try {
      const accessToken = await openGoogleAuthPopup();
      const googleRole = landingTabRef.current === "mechanic" ? "mechanic" : landingTabRef.current === "owner" ? "shop" : "customer";
      const data = await api.post("/api/auth/google", { accessToken, role: googleRole });
      handleAuthResponse(data);
    } catch (e: any) {
      if (e?.message === "popup_closed") { /* user cancelled — not an error */ }
      else if (e?.message === "popup_blocked") setError("Please allow popups for this site and try again.");
      else setError(getErr(e, "Google sign-in failed. Try again."));
    }
    setGoogleLoading(false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────
  const renderStep = () => {
    // Full-panel loader while Google popup is verifying
    if (googleLoading) {
      return (
        <div className="auth-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 320, gap: 20, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#FBF0EE", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 28, height: 28, border: "3px solid rgba(190,43,26,0.2)", borderTopColor: "#BE2B1A", borderRadius: "50%", animation: "auth-spin 0.75s linear infinite" }} />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#BE2B1A", fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 6 }}>Signing you in…</div>
            <div style={{ fontSize: 12, color: "#9C8C7C", lineHeight: 1.6, maxWidth: 280 }}>Verifying your Google account — just a moment</div>
          </div>
        </div>
      );
    }

    // Full-panel loader while email sign-in / register is waiting on the backend
    if (loading && (step === STEPS.SIGNIN || step === STEPS.REG_AUTH || step === STEPS.ADMIN_AUTH)) {
      return (
        <div className="auth-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 320, gap: 20, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#FBF0EE", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 28, height: 28, border: "3px solid rgba(190,43,26,0.2)", borderTopColor: "#BE2B1A", borderRadius: "50%", animation: "auth-spin 0.75s linear infinite" }} />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#BE2B1A", fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 6 }}>
              {step === STEPS.REG_AUTH ? "Creating your account…" : "Signing you in…"}
            </div>
            <div style={{ fontSize: 12, color: "#9C8C7C", lineHeight: 1.6, maxWidth: 280 }}>This may take a moment</div>
          </div>
        </div>
      );
    }

    switch (step) {

      // ══════════════════════════════════════════════════════════════════════
      // LANDING — Role selector: Customer vs Shop Owner
      // ══════════════════════════════════════════════════════════════════════
      case STEPS.LANDING:
        // isModal: Option 3 — slim top bar (rendered in layout) + toggle + sign-in form
        if (isModal) {
          return (
            <div className="auth-card">
              {/* Segmented role toggle */}
              <div style={{ display: "flex", background: "#F0E8DF", borderRadius: 11, padding: 4, marginBottom: 18 }}>
                {[
                  { key: "customer", icon: "directions_car", label: "Customer" },
                  { key: "owner", icon: "storefront", label: "Shop Owner" },
                  { key: "mechanic", icon: "build", label: "Mechanic" },
                ].map(t => (
                  <button
                    key={t.key}
                    onClick={() => { setLandingTab(t.key); setRole(t.key === "owner" ? "shop" : t.key === "mechanic" ? "mechanic" : "customer"); setError(""); }}
                    style={{
                      flex: 1, padding: "9px 0", borderRadius: 8, border: "none",
                      background: landingTab === t.key ? "#FFFFFF" : "transparent",
                      color: landingTab === t.key ? "#1A1205" : "#9C8C7C",
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                      fontFamily: "'Inter', sans-serif",
                      boxShadow: landingTab === t.key ? "0 1px 6px rgba(26,18,5,0.1)" : "none",
                      transition: "all 0.18s",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#1A1205", letterSpacing: "-0.3px", fontFamily: "'Plus Jakarta Sans',sans-serif", lineHeight: 1.15 }}>
                  {landingTab === "mechanic" ? "Mechanic Portal" : landingTab === "owner" ? "Welcome back" : "Sign in"}
                </div>
                <div style={{ fontSize: 13, color: "#9C8C7C", marginTop: 4, lineHeight: 1.4 }}>
                  {landingTab === "mechanic" ? "Sign in to your mechanic dashboard." : landingTab === "owner" ? "Sign in to your shop dashboard." : "Access your RedPiston account."}
                </div>
              </div>

              {error && <div style={S.error}>{error}</div>}

              {!forgotMode && (
                <>
                  <label style={S.label}>Email Address</label>
                  <input className="auth-input" style={{ ...S.input, marginBottom: 10 }} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} autoFocus />

                  <label style={S.label}>Password</label>
                  <div style={{ position: "relative", marginBottom: 4 }}>
                    <input className="auth-input" style={{ ...S.input, paddingRight: 44 }} type={showPwd ? "text" : "password"} placeholder="Your password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && emailSignIn()} />
                    <button onClick={() => setShowPwd(p => !p)} aria-label={showPwd ? "Hide password" : "Show password"} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#9C8C7C", cursor: "pointer", lineHeight: 0, padding: 4 }}>
                    {showPwd
                      ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                  </button>
                  </div>
                  <div style={{ textAlign: "right", marginBottom: 14 }}>
                    <button onClick={() => { setForgotMode(true); setForgotEmail(email); setError(""); }} style={{ background: "none", border: "none", color: "#BE2B1A", cursor: "pointer", fontSize: 12, fontFamily: "'Inter',sans-serif", fontWeight: 600 }}>Forgot password?</button>
                  </div>

                  <button className="btn-primary" style={{ ...S.btnPrimary(loading || googleLoading), marginBottom: 12 }} disabled={loading || googleLoading} onClick={emailSignIn}>
                    {loading ? <><span className="auth-spinner" />Signing in…</> : "Sign In →"}
                  </button>
                  <div style={S.divider}><div style={S.dividerLine}/><span style={S.dividerText}>OR</span><div style={S.dividerLine}/></div>
                  <button className="btn-google" style={{ ...S.btnGoogle, opacity: loading || googleLoading ? 0.6 : 1, cursor: loading || googleLoading ? "not-allowed" : "pointer" }} disabled={loading || googleLoading} onClick={() => googleAuth("signin")}>
                    <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                    {googleLoading ? "Signing in…" : "Continue with Google"}
                  </button>
                </>
              )}

              {/* Forgot password inline */}
              {forgotMode && (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1205", marginBottom: 6 }}>Reset Password</div>
                  <div style={{ fontSize: 13, color: "#9C8C7C", marginBottom: 18 }}>Enter your email and we'll send a reset link.</div>
                  {forgotSent ? (
                    <div style={{ background: "#F0FDF4", border: `1px solid #86EFAC`, borderRadius: 10, padding: "14px 16px", fontSize: 13 }}>
                      <div style={{ color: "#16A34A", fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span> Link sent! Check your inbox.</div>
                      <div style={{ color: "#5C4F40", lineHeight: 1.5 }}>
                        We sent a link to <strong style={{ color: "#1A1205" }}>{forgotEmail}</strong>.<br />
                        Click it to set or reset your password. Check spam if you don't see it.
                      </div>
                    </div>
                  ) : (
                    <>
                      <label style={S.label}>Email Address</label>
                      <input className="auth-input" style={{ ...S.input, marginBottom: 16 }} type="email" placeholder="you@example.com" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} autoFocus />
                      <button className="btn-primary" style={{ ...S.btnPrimary(loading), marginBottom: 12 }} disabled={loading} onClick={sendForgotPassword}>
                        {loading ? "Sending…" : "Send Reset Link →"}
                      </button>
                    </>
                  )}
                  <button style={{ ...S.btnOutline }} onClick={() => { setForgotMode(false); setForgotSent(false); setError(""); }}>← Back to Sign In</button>
                </>
              )}

              {!forgotMode && (
                <div style={{ textAlign: "center", fontSize: 13, color: "#9C8C7C", marginTop: 14, paddingTop: 12, borderTop: "1px solid #E0D5C8" }}>
                  {landingTab === "mechanic" ? "New mechanic? " : landingTab === "owner" ? "New shop? " : "No account? "}
                  <button onClick={() => {
                    setEmail(""); setPassword(""); setConfirmPwd("");
                    setRole(landingTab === "owner" ? "shop" : landingTab === "mechanic" ? "mechanic" : "customer");
                    go(STEPS.REG_AUTH);
                  }} style={{ background: "none", border: "none", color: "#BE2B1A", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "'Inter',sans-serif" }}>
                    {landingTab === "mechanic" ? "Register as mechanic →" : landingTab === "owner" ? "Register your shop →" : "Create account →"}
                  </button>
                </div>
              )}
            </div>
          );
        }

        // Non-modal: two role cards
        return (
          <div className="auth-card">
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={S.heading}>Welcome to RedPiston</div>
              <div style={{ fontSize: 15, color: "#9C8C7C", marginTop: 8, lineHeight: 1.5 }}>How would you like to continue?</div>
            </div>

            {/* Role cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 22 }}>
              {[
                { key: "customer", icon: "directions_car", title: "Customer", desc: "Buy auto parts with fitment guarantee", cta: "Create Account",
                  onSignIn: () => { setLandingTab("customer"); go(STEPS.SIGNIN); },
                  onCreate: () => { setRole("customer"); setLandingTab("customer"); go(STEPS.REG_AUTH); } },
                { key: "owner", icon: "storefront", title: "Shop Owner", desc: "Manage your shop, billing & inventory", cta: "Register Shop",
                  onSignIn: () => { setLandingTab("owner"); go(STEPS.SIGNIN); },
                  onCreate: () => { setRole("shop"); setLandingTab("owner"); go(STEPS.REG_AUTH); } },
                { key: "mechanic", icon: "build", title: "Mechanic", desc: "Manage jobs, track clients & grow your workshop", cta: "Register",
                  onSignIn: () => { setLandingTab("mechanic"); go(STEPS.SIGNIN); },
                  onCreate: () => { setRole("mechanic"); setLandingTab("mechanic"); go(STEPS.REG_AUTH); } },
              ].map(r => (
                <div key={r.key} style={{ background: "#FFFFFF", border: "1.5px solid #E0D5C8", borderRadius: 16, padding: "26px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 0, boxShadow: "0 2px 10px rgba(26,18,5,0.05)" }}>
                  <div style={{ width: 58, height: 58, borderRadius: "50%", background: "#FBF0EE", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#BE2B1A" }}>{r.icon}</span>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#1A1205", marginBottom: 6, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{r.title}</div>
                  <div style={{ fontSize: 13, color: "#9C8C7C", lineHeight: 1.5, textAlign: "center", marginBottom: 20, minHeight: 40 }}>{r.desc}</div>
                  <button className="btn-primary" style={{ ...S.btnPrimary(false), marginBottom: 9 }}
                    onClick={r.onSignIn}>
                    Sign In →
                  </button>
                  <button className="btn-outline-stitch" style={{ ...S.btnOutline }}
                    onClick={r.onCreate}>
                    {r.cta}
                  </button>
                </div>
              ))}
            </div>

            {/* Shop mechanic join (via invite code) */}
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <a href="/mechanic/join" style={{ fontSize: 12, color: "#BFB0A0", textDecoration: "none" }}>Joining a shop via invite code? →</a>
            </div>

            {/* Admin access */}
            <div style={{ textAlign: "center", paddingTop: 16, borderTop: "1px solid #E0D5C8" }}>
              <button
                style={{ background: "none", border: "none", color: "#BFB0A0", cursor: "pointer", fontSize: 11, fontFamily: FONT.mono, letterSpacing: "0.06em" }}
                onClick={() => { setEmail(""); setPassword(""); go(STEPS.ADMIN_AUTH); }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 13, verticalAlign: "middle" }}>shield</span> PLATFORM ADMIN ACCESS
              </button>
            </div>
          </div>
        );

      // ══════════════════════════════════════════════════════════════════════
      // SIGN IN — existing users (email + password only)
      // ══════════════════════════════════════════════════════════════════════
      case STEPS.SIGNIN:
        return (
          <div className="auth-card">
            <button style={S.btnBack} onClick={() => back(STEPS.LANDING)}>← Back</button>
            <div style={{ ...S.chip, display: "flex", alignItems: "center", gap: 4 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 12, lineHeight: 1 }}>
                {landingTab === "mechanic" ? "build" : landingTab === "owner" ? "storefront" : "directions_car"}
              </span>
              {landingTab === "mechanic" ? "Mechanic" : landingTab === "owner" ? "Shop Owner" : "Customer"} · Sign In
            </div>
            <div style={S.heading}>Welcome back</div>
            <div style={S.sub}>{landingTab === "mechanic" ? "Sign in to your mechanic dashboard." : landingTab === "owner" ? "Sign in to your shop dashboard." : "Sign in to browse parts & track orders."}</div>

            {error && <div style={S.error}>{error}</div>}

            {!forgotMode && (
              <>
                <label style={S.label}>Email Address</label>
                <input className="auth-input" style={{ ...S.input, marginBottom: isModal ? 8 : 14 }} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} autoFocus />

                <label style={S.label}>Password</label>
                <div style={{ position: "relative", marginBottom: 8 }}>
                  <input className="auth-input" style={{ ...S.input, paddingRight: 44 }} type={showPwd ? "text" : "password"} placeholder="Your password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && emailSignIn()} />
                  <button onClick={() => setShowPwd(p => !p)} aria-label={showPwd ? "Hide password" : "Show password"} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#9C8C7C", cursor: "pointer", lineHeight: 0, padding: 4 }}>
                    {showPwd
                      ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                  </button>
                </div>
                <div style={{ textAlign: "right", marginBottom: isModal ? 10 : 18 }}>
                  <button onClick={() => { setForgotMode(true); setForgotEmail(email); setError(""); }} style={{ background: "none", border: "none", color: "#BE2B1A", cursor: "pointer", fontSize: 12, fontFamily: FONT.ui, fontWeight: 600 }}>Forgot password?</button>
                </div>
                <button className="btn-primary" style={{ ...S.btnPrimary(loading || googleLoading), marginBottom: isModal ? 10 : 16 }} disabled={loading || googleLoading} onClick={emailSignIn}>
                  {loading ? <><span className="auth-spinner" />Signing in…</> : "Sign In →"}
                </button>
                <div style={S.divider}><div style={S.dividerLine}/><span style={S.dividerText}>OR</span><div style={S.dividerLine}/></div>
                <button className="btn-google" style={{ ...S.btnGoogle, opacity: loading || googleLoading ? 0.6 : 1, cursor: loading || googleLoading ? "not-allowed" : "pointer" }} disabled={loading || googleLoading} onClick={() => googleAuth("signin")}>
                  <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                  {googleLoading ? "Signing in…" : "Continue with Google"}
                </button>
              </>
            )}

            {/* Forgot password inline */}
            {forgotMode && (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1205", marginBottom: 6 }}>Reset Password</div>
                <div style={{ fontSize: 13, color: "#9C8C7C", marginBottom: 18 }}>Enter your email and we'll send a reset link.</div>
                {forgotSent ? (
                  <div style={{ background: "#F0FDF4", border: `1px solid #86EFAC`, borderRadius: 10, padding: "14px 16px", fontSize: 13 }}>
                    <div style={{ color: "#16A34A", fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span> Link sent! Check your inbox.</div>
                    <div style={{ color: "#5C4F40", lineHeight: 1.5 }}>
                      We sent a link to <strong style={{ color: "#1A1205" }}>{forgotEmail}</strong>.<br />
                      Click it to set or reset your password. Check spam if you don't see it.
                    </div>
                  </div>
                ) : (
                  <>
                    <label style={S.label}>Email Address</label>
                    <input className="auth-input" style={{ ...S.input, marginBottom: 16 }} type="email" placeholder="you@example.com" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} autoFocus />
                    <button className="btn-primary" style={{ ...S.btnPrimary(loading), marginBottom: 12 }} disabled={loading} onClick={sendForgotPassword}>
                      {loading ? "Sending…" : "Send Reset Link →"}
                    </button>
                  </>
                )}
                <button style={{ ...S.btnOutline }} onClick={() => { setForgotMode(false); setForgotSent(false); setError(""); }}>← Back to Sign In</button>
              </>
            )}

            {/* Link to create account */}
            <div style={{ textAlign: "center", fontSize: 13, color: "#9C8C7C", marginTop: 24, paddingTop: 18, borderTop: `1px solid #E0D5C8` }}>
              {landingTab === "mechanic" ? "New mechanic? " : landingTab === "owner" ? "New shop? " : "No account? "}
              <button onClick={() => {
                setRole(landingTab === "owner" ? "shop" : landingTab === "mechanic" ? "mechanic" : "customer");
                setEmail(""); setPassword("");
                go(STEPS.REG_AUTH);
              }} style={{ background: "none", border: "none", color: "#BE2B1A", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: FONT.ui }}>
                {landingTab === "mechanic" ? "Register as mechanic →" : landingTab === "owner" ? "Register your shop →" : "Create account →"}
              </button>
            </div>
          </div>
        );

      // ══════════════════════════════════════════════════════════════════════
      // CREATE ACCOUNT — new users
      // ══════════════════════════════════════════════════════════════════════

      // ── Role selection ────────────────────────────────────────────────────
      case STEPS.REG_ROLE:
        return (
          <div className="auth-card">
            <button style={S.btnBack} onClick={() => back(STEPS.LANDING)}>← Back</button>
            <div style={S.chip}>Create Account · Step 1 of 3</div>
            <div style={S.heading}>What describes you?</div>
            <div style={S.sub}>Choose your role to get the right setup.</div>
            {error && <div style={S.error}>{error}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 28 }}>
              {[
                { key: "shop", icon: "storefront", title: "Shop Owner", desc: "Run your auto parts shop — billing, inventory, credit" },
                { key: "customer", icon: "directions_car", title: "Customer / Mechanic", desc: "Buy parts with fitment guarantee & track orders" },
              ].map(r => (
                <div key={r.key} className={`role-card ${role === r.key ? "selected" : ""}`}
                  onClick={() => setRole(r.key)} role="button" tabIndex={0}
                  onKeyDown={e => (e.key === "Enter" || e.key === " ") && setRole(r.key)}
                  style={{ padding: "20px 14px", borderRadius: 14, border: `2px solid #E0D5C8`, background: "#FFFFFF", cursor: "pointer", textAlign: "center", position: "relative", transition: "all 0.2s", boxShadow: "0 1px 4px rgba(26,18,5,0.06)" }}>
                  {role === r.key && <div style={{ position: "absolute", top: 10, right: 10, width: 22, height: 22, borderRadius: "50%", background: "#BE2B1A", color: "#fff", fontSize: 12, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>}
                  <span className="material-symbols-outlined" style={{ fontSize: 30, color: "#BE2B1A", display: "block", marginBottom: 10 }}>{r.icon}</span>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1205", marginBottom: 4 }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: "#5C4F40", lineHeight: 1.4 }}>{r.desc}</div>
                </div>
              ))}
            </div>

            <button className="btn-primary" style={S.btnPrimary(!role)} disabled={!role} onClick={() => role && go(STEPS.REG_AUTH)}>
              Continue →
            </button>
          </div>
        );

      // ── Auth method for registration (email only) ─────────────────────────
      case STEPS.REG_AUTH:
        return (
          <div className="auth-card">
            <button style={S.btnBack} onClick={() => { setHideGoogleForMechanic(false); back(STEPS.LANDING); }}>← Back</button>
            <div style={{ ...S.chip, display: "flex", alignItems: "center", gap: 4 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 12, lineHeight: 1 }}>
                {role === "shop" ? "storefront" : role === "mechanic" ? "build" : "directions_car"}
              </span>
              {role === "shop" ? "Register Shop" : role === "mechanic" ? "Register Mechanic" : "Customer"} · Step 1 of 3
            </div>
            <div style={S.heading}>{role === "shop" ? "Create Shop Account" : role === "mechanic" ? "Create Mechanic Account" : "Create Account"}</div>
            <div style={S.sub}>{role === "shop" ? "Set up your credentials — shop details come next." : role === "mechanic" ? "Set up your credentials — your profile details come next." : "Quick setup — takes under a minute."}</div>

            {error && <div style={S.error}>{error}</div>}

            <label style={S.label}>Email Address</label>
            <input className="auth-input" style={{ ...S.input, marginBottom: 12 }} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
            <label style={S.label}>Password</label>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <input className="auth-input" style={{ ...S.input, paddingRight: 44 }} type={showPwd ? "text" : "password"} placeholder="Min. 8 characters" value={password} onChange={e => setPassword(e.target.value)} />
              <button onClick={() => setShowPwd(p => !p)} aria-label={showPwd ? "Hide password" : "Show password"} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#9C8C7C", cursor: "pointer", lineHeight: 0, padding: 4 }}>
                {showPwd ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg> : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
              </button>
            </div>
            <label style={S.label}>Confirm Password</label>
            <div style={{ position: "relative", marginBottom: 20 }}>
              <input className="auth-input" style={{ ...S.input, paddingRight: 44 }} type={showConfirmPwd ? "text" : "password"} placeholder="Repeat password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} onKeyDown={e => e.key === "Enter" && emailRegister()} />
              <button onClick={() => setShowConfirmPwd(p => !p)} aria-label={showConfirmPwd ? "Hide password" : "Show password"} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#9C8C7C", cursor: "pointer", lineHeight: 0, padding: 4 }}>
                {showConfirmPwd ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg> : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
              </button>
            </div>
            <button className="btn-primary" style={{ ...S.btnPrimary(loading || googleLoading), marginBottom: 14 }} disabled={loading || googleLoading}
              onClick={role === "mechanic" ? emailRegisterMechanic : emailRegister}>
              {loading ? "Creating account…" : role === "shop" ? "Continue to Shop Details →" : role === "mechanic" ? "Continue →" : "Create Account →"}
            </button>
            {!(role === "mechanic" && hideGoogleForMechanic) && (
              <>
                <div style={S.divider}><div style={S.dividerLine}/><span style={S.dividerText}>OR</span><div style={S.dividerLine}/></div>
                <button className="btn-google" style={{ ...S.btnGoogle, opacity: loading || googleLoading ? 0.6 : 1, cursor: loading || googleLoading ? "not-allowed" : "pointer", marginBottom: 6 }} disabled={loading || googleLoading} onClick={() => googleAuth("register")}>
                  <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                  {googleLoading ? "Signing in…" : "Continue with Google"}
                </button>
              </>
            )}
            {role === "mechanic" && hideGoogleForMechanic && (
              <div style={{ fontSize: 12, color: "#9C8C7C", textAlign: "center", marginTop: 8, padding: "10px 12px", background: "#FAF6F0", borderRadius: 8, border: "1px solid #E0D5C8" }}>
                Your Google email is linked to a Customer account. Use a different email to create a Mechanic account.
              </div>
            )}

            <div style={{ textAlign: "center", fontSize: 13, color: "#9C8C7C", marginTop: 6, paddingTop: 16, borderTop: `1px solid #E0D5C8` }}>
              Already have an account?{" "}
              <button onClick={() => go(STEPS.SIGNIN)} style={{ background: "none", border: "none", color: "#BE2B1A", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: FONT.ui }}>Sign in →</button>
            </div>
          </div>
        );

      // ── Email OTP — required for manual signup/login, skipped for Google ──
      case STEPS.VERIFY_EMAIL:
        return (
          <div className="auth-card">
            <div style={S.chip}>Verify your email</div>
            <div style={S.heading}>Enter the code we sent</div>
            <div style={S.sub}>We emailed a 6-digit code to <strong>{email}</strong>. It expires in 10 minutes.</div>

            {(error || otpError) && <div style={S.error}>{error || otpError}</div>}

            <label style={S.label}>Verification Code</label>
            <input
              className="auth-input"
              style={{ ...S.input, marginBottom: 20, textAlign: "center", fontSize: 22, letterSpacing: "0.3em", fontWeight: 700 }}
              inputMode="numeric" maxLength={6} placeholder="000000"
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={e => e.key === "Enter" && otpCode.length === 6 && verifyOtp()}
              autoFocus
            />

            <button className="btn-primary" style={S.btnPrimary(otpVerifying || otpCode.length !== 6)} disabled={otpVerifying || otpCode.length !== 6} onClick={verifyOtp}>
              {otpVerifying ? "Verifying…" : "Verify & Continue →"}
            </button>

            <div style={{ textAlign: "center", fontSize: 13, color: "#9C8C7C", marginTop: 16 }}>
              Didn't get it?{" "}
              <button
                onClick={resendOtp}
                disabled={otpResending || otpResendCooldown > 0}
                style={{ background: "none", border: "none", color: otpResendCooldown > 0 ? "#BFB0A0" : "#BE2B1A", cursor: otpResendCooldown > 0 ? "default" : "pointer", fontSize: 13, fontWeight: 700, fontFamily: FONT.ui }}
              >
                {otpResendCooldown > 0 ? `Resend in ${otpResendCooldown}s` : (otpResending ? "Sending…" : "Resend code")}
              </button>
            </div>
          </div>
        );

      // ══════════════════════════════════════════════════════════════════════
      // SHOP DETAILS — step 3 for new shop owners
      // ══════════════════════════════════════════════════════════════════════
      case STEPS.SHOP_DETAILS:
        return (
          <div className="auth-card">
            {/* Progress indicator */}
            <div style={{ display: "flex", gap: 6, marginBottom: 28 }}>
              {["Identity", "Shop Details", "Verification"].map((label, i) => (
                <div key={label} style={{ flex: 1 }}>
                  <div style={{ height: 3, borderRadius: 4, background: i <= 1 ? "#BE2B1A" : "#E0D5C8", marginBottom: 5 }} />
                  <div style={{ fontSize: 9, color: i <= 1 ? "#BE2B1A" : "#BFB0A0", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={S.chip}>Shop Owner · Step 3 of 3</div>
            <div style={S.heading}>Tell us about your shop</div>
            <div style={S.sub}>These details let our team verify you're a legitimate retailer.</div>

            {resumeNotice && (
              <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 8, padding: "11px 14px", color: "#15803D", fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 15, verticalAlign: "middle", color: "#15803D" }}>check_circle</span> {resumeNotice}
              </div>
            )}
            {error && <div style={S.error}>{error}</div>}

            <label style={S.label}>Your Full Name <span style={{ color: "#DC2626" }}>*</span></label>
            <input className="auth-input" style={{ ...S.input, marginBottom: shopFieldErrors.ownerName ? 4 : 14, ...errStyle(shopFieldErrors.ownerName) }} placeholder="e.g. Rajesh Kumar" value={shopDetails.ownerName} onChange={e => { setShopDetails(d => ({ ...d, ownerName: e.target.value })); setShopFieldErrors(p => ({ ...p, ownerName: false })); }} autoFocus />
            {shopFieldErrors.ownerName && <div style={S.fieldErr}>↑ Required</div>}

            <label style={S.label}>Shop Name <span style={{ color: "#DC2626" }}>*</span></label>
            <input className="auth-input" style={{ ...S.input, marginBottom: shopFieldErrors.shopName ? 4 : 14, ...errStyle(shopFieldErrors.shopName) }} placeholder="e.g. Kumar Auto Parts" value={shopDetails.shopName} onChange={e => { setShopDetails(d => ({ ...d, shopName: e.target.value })); setShopFieldErrors(p => ({ ...p, shopName: false })); }} />
            {shopFieldErrors.shopName && <div style={S.fieldErr}>↑ Required</div>}

            <label style={S.label}>Shop Address <span style={{ color: "#DC2626" }}>*</span></label>
            <input className="auth-input" style={{ ...S.input, marginBottom: shopFieldErrors.address ? 4 : 14, ...errStyle(shopFieldErrors.address) }} placeholder="e.g. Plot 12, KPHB Colony, Kukatpally" value={shopDetails.address} onChange={e => { setShopDetails(d => ({ ...d, address: e.target.value })); setShopFieldErrors(p => ({ ...p, address: false })); }} />
            {shopFieldErrors.address && <div style={S.fieldErr}>↑ Required</div>}

            <label style={S.label}>City <span style={{ color: "#DC2626" }}>*</span></label>
            <input className="auth-input" style={{ ...S.input, marginBottom: shopFieldErrors.city ? 4 : 14, ...errStyle(shopFieldErrors.city) }} placeholder="e.g. Hyderabad" value={shopDetails.city} onChange={e => { setShopDetails(d => ({ ...d, city: e.target.value })); setShopFieldErrors(p => ({ ...p, city: false })); }} />
            {shopFieldErrors.city && <div style={S.fieldErr}>↑ Required</div>}

            <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 2 }}>
                <label style={S.label}>State <span style={{ color: "#DC2626" }}>*</span></label>
                <select className="auth-input" style={{ ...S.input, cursor: "pointer", ...errStyle(shopFieldErrors.state) }} value={shopDetails.state} onChange={e => { setShopDetails(d => ({ ...d, state: e.target.value })); setShopFieldErrors(p => ({ ...p, state: false })); }}>
                  <option value="">Select state…</option>
                  {INDIA_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {shopFieldErrors.state && <div style={S.fieldErr}>↑ Required</div>}
              </div>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Pincode <span style={{ color: "#DC2626" }}>*</span></label>
                <input className="auth-input" style={{ ...S.input, ...errStyle(shopFieldErrors.pincode) }} placeholder="500001" value={shopDetails.pincode} maxLength={6} inputMode="numeric" onChange={e => { setShopDetails(d => ({ ...d, pincode: e.target.value.replace(/\D/g, "") })); setShopFieldErrors(p => ({ ...p, pincode: false })); }} />
                {shopFieldErrors.pincode && <div style={S.fieldErr}>↑ 6 digits</div>}
              </div>
            </div>

            <label style={S.label}>What does your business do? <span style={{ color: "#DC2626" }}>*</span></label>
            <div style={{ display: "flex", gap: 8, marginBottom: shopFieldErrors.businessType ? 4 : 14 }}>
              {[
                { key: "PARTS", label: "Auto Parts Shop" },
                { key: "SERVICES", label: "Car Decor & Services" },
                { key: "BOTH", label: "Both" },
              ].map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => { setShopDetails(d => ({ ...d, businessType: opt.key })); setShopFieldErrors(p => ({ ...p, businessType: false, shopCategory: false })); }}
                  style={{
                    flex: 1, padding: "10px 8px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                    border: shopDetails.businessType === opt.key ? "2px solid #B91C1C" : "1px solid #D1D5DB",
                    background: shopDetails.businessType === opt.key ? "#FEF2F2" : "#fff",
                    color: shopDetails.businessType === opt.key ? "#B91C1C" : "#374151",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {shopFieldErrors.businessType && <div style={S.fieldErr}>↑ Required</div>}

            {shopDetails.businessType !== "SERVICES" && (
              <>
                <label style={S.label}>Shop Category <span style={{ color: "#DC2626" }}>*</span></label>
                <select className="auth-input" style={{ ...S.input, marginBottom: shopFieldErrors.shopCategory ? 4 : 14, cursor: "pointer", ...errStyle(shopFieldErrors.shopCategory) }} value={shopDetails.shopCategory} onChange={e => { setShopDetails(d => ({ ...d, shopCategory: e.target.value })); setShopFieldErrors(p => ({ ...p, shopCategory: false })); }}>
                  <option value="">Select category…</option>
                  <option value="AUTO_PARTS">Auto Parts Retailer</option>
                  <option value="WORKSHOP">Workshop / Service Centre</option>
                  <option value="BOTH">Auto Parts + Workshop</option>
                  <option value="TYRES">Tyre Shop</option>
                  <option value="ELECTRICAL">Auto Electrical</option>
                  <option value="GENERAL">General Automotive</option>
                </select>
                {shopFieldErrors.shopCategory && <div style={S.fieldErr}>↑ Required</div>}
              </>
            )}

            <label style={S.label}>Shop Contact Number <span style={{ color: "#DC2626" }}>*</span></label>
            <div style={{ ...S.phoneRow, marginBottom: shopFieldErrors.contactPhone ? 4 : 14 }}>
              <div style={S.phoneFlag}>IN +91</div>
              <input className="auth-input" style={{ ...S.phoneInput, ...errStyle(shopFieldErrors.contactPhone) }} placeholder="98765 43210" value={shopDetails.contactPhone} maxLength={10} inputMode="numeric" onChange={e => { setShopDetails(d => ({ ...d, contactPhone: e.target.value.replace(/\D/g, "") })); setShopFieldErrors(p => ({ ...p, contactPhone: false })); }} />
            </div>
            {shopFieldErrors.contactPhone && <div style={S.fieldErr}>↑ Enter a valid 10-digit number</div>}

            <label style={S.label}>WhatsApp Number <span style={{ color: "#DC2626" }}>*</span></label>
            <div style={{ ...S.phoneRow, marginBottom: shopFieldErrors.whatsappNumber ? 4 : 14 }}>
              <div style={S.phoneFlag}>IN +91</div>
              <input className="auth-input" style={{ ...S.phoneInput, ...errStyle(shopFieldErrors.whatsappNumber) }} placeholder="98765 43210" value={shopDetails.whatsappNumber} maxLength={10} inputMode="numeric" onChange={e => { setShopDetails(d => ({ ...d, whatsappNumber: e.target.value.replace(/\D/g, "") })); setShopFieldErrors(p => ({ ...p, whatsappNumber: false })); }} />
            </div>
            {shopFieldErrors.whatsappNumber && <div style={S.fieldErr}>↑ Enter a valid 10-digit number</div>}

            <label style={S.label}>Shop Email <span style={{ color: "#DC2626" }}>*</span></label>
            <input className="auth-input" style={{ ...S.input, marginBottom: shopFieldErrors.email ? 4 : 14, ...errStyle(shopFieldErrors.email) }} type="email" placeholder="shop@example.com" value={shopDetails.email} onChange={e => { setShopDetails(d => ({ ...d, email: e.target.value })); setShopFieldErrors(p => ({ ...p, email: false })); }} />
            {shopFieldErrors.email && <div style={S.fieldErr}>↑ Enter a valid email address</div>}

            <label style={S.label}>GSTIN <span style={{ color: "#DC2626" }}>*</span></label>
            <input className="auth-input" style={{ ...S.input, marginBottom: shopFieldErrors.gstin ? 4 : 14, fontFamily: FONT.mono, letterSpacing: "1px", ...errStyle(shopFieldErrors.gstin) }} placeholder="22AAAAA0000A1Z5" value={shopDetails.gstin} maxLength={15} onChange={e => { setShopDetails(d => ({ ...d, gstin: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })); setShopFieldErrors(p => ({ ...p, gstin: false })); }} />
            {shopFieldErrors.gstin && <div style={S.fieldErr}>↑ Enter a valid 15-character GSTIN</div>}

            <label style={{ ...S.label, marginBottom: 6 }}>Shop Photo <span style={{ color: "#DC2626" }}>*</span></label>
            <div style={shopFieldErrors.photoUrl ? { border: "1.5px solid #DC2626", borderRadius: 10, padding: 4 } : undefined}>
              <ShopPhotoUploader photoUrl={shopDetails.photoUrl} onUploaded={url => { setShopDetails(d => ({ ...d, photoUrl: url })); setShopFieldErrors(p => ({ ...p, photoUrl: false })); }} />
            </div>
            {shopFieldErrors.photoUrl && <div style={{ ...S.fieldErr, marginTop: -10 }}>↑ Upload a shop photo to continue</div>}

            {/* Repeat the error near the button — on mobile the top-of-form error is off-screen */}
            {error && (
              <div style={{ ...S.error, marginTop: 16, marginBottom: 0 }}>{error}</div>
            )}
            <button className="btn-primary" style={{ ...S.btnPrimary(loading), marginTop: 12 }}
              disabled={loading}
              onClick={submitShopDetails}>
              {loading ? "Submitting…" : "Submit for Verification →"}
            </button>
            <div style={{ textAlign: "center", fontSize: 12, color: "#BFB0A0", marginTop: 10 }}>
              Our team reviews and approves within 24–48 hours.
            </div>
          </div>
        );

      // ══════════════════════════════════════════════════════════════════════
      // PROFILE — new customer name setup
      // ══════════════════════════════════════════════════════════════════════
      case STEPS.PROFILE:
        return (
          <div className="auth-card">
            <div style={S.chip}>Almost done!</div>
            <div style={S.heading}>Quick setup</div>
            <div style={S.sub}>Tell us a bit about yourself so we can personalise your experience.</div>
            {resumeNotice && (
              <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 8, padding: "11px 14px", color: "#15803D", fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 15, verticalAlign: "middle", color: "#15803D" }}>check_circle</span> {resumeNotice}
              </div>
            )}
            {error && <div style={S.error}>{error}</div>}
            <label style={S.label}>Full Name <span style={{ color: "#DC2626" }}>*</span></label>
            <input className="auth-input" style={{ ...S.input, marginBottom: 18, ...errStyle(!!error && !profile.name.trim()) }} placeholder="e.g. Arjun Sharma" value={profile.name} onChange={e => { setProfile(p => ({ ...p, name: e.target.value })); setError(""); }} autoFocus />
            <label style={S.label}>Account Type</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <button type="button"
                onClick={() => setProfile(p => ({ ...p, profileType: p.profileType === "FLEET_MANAGER" ? "INDIVIDUAL" : "FLEET_MANAGER" }))}
                style={{ flex: 1, padding: "10px 6px", borderRadius: 8, border: `1.5px solid ${profile.profileType === "FLEET_MANAGER" ? "#BE2B1A" : "#E0D5C8"}`, background: profile.profileType === "FLEET_MANAGER" ? "rgba(190,43,26,0.08)" : "#FFFFFF", color: profile.profileType === "FLEET_MANAGER" ? "#BE2B1A" : "#5C4F40", cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", transition: "all 0.15s", textAlign: "center" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, marginBottom: 4, display: "block" }}>local_shipping</span>
                Fleet Manager
              </button>
            </div>

            {/* Vehicle — core to the marketplace experience */}
            <div style={{ background: "#FAF6F0", border: "1px solid #E0D5C8", borderRadius: 10, padding: "14px 14px 10px", marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#5C4F40", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: "middle" }}>directions_car</span> Add Your Vehicle <span style={{ fontWeight: 400, color: "#9C8C7C", fontSize: 11 }}>(optional — get personalised part suggestions)</span>
              </div>
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <input className="auth-input" style={{ ...S.input, flex: 1, marginBottom: 0 }} placeholder="Make (e.g. Maruti)" value={vehicle.make} onChange={e => setVehicle(v => ({ ...v, make: e.target.value }))} />
                <input className="auth-input" style={{ ...S.input, flex: 1, marginBottom: 0 }} placeholder="Model (e.g. Swift)" value={vehicle.model} onChange={e => setVehicle(v => ({ ...v, model: e.target.value }))} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <input className="auth-input" style={{ ...S.input, flex: 1, marginBottom: 0 }} placeholder="Year (e.g. 2019)" maxLength={4} inputMode="numeric" value={vehicle.year} onChange={e => setVehicle(v => ({ ...v, year: e.target.value.replace(/\D/g,"") }))} />
                <select className="auth-input" style={{ ...S.input, flex: 1, marginBottom: 0, cursor: "pointer" }} value={vehicle.fuelType} onChange={e => setVehicle(v => ({ ...v, fuelType: e.target.value }))}>
                  <option value="">Fuel type</option>
                  <option value="Petrol">Petrol</option>
                  <option value="Diesel">Diesel</option>
                  <option value="CNG">CNG</option>
                  <option value="Electric">Electric</option>
                  <option value="Hybrid">Hybrid</option>
                </select>
              </div>
            </div>

            <button className="btn-primary" style={S.btnPrimary(loading)} disabled={loading} onClick={saveProfile}>
              {loading ? "Saving…" : "Enter RedPiston →"}
            </button>
          </div>
        );

      // ══════════════════════════════════════════════════════════════════════
      // MECHANIC DETAILS — name / phone / shop info for new independent mechanics
      // ══════════════════════════════════════════════════════════════════════
      case STEPS.MECHANIC_DETAILS:
        return (
          <div className="auth-card">
            <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
              {[
                { label: "Account", done: true },
                { label: "Your Details", done: true },
                { label: "Verify Email", done: false },
              ].map(({ label, done }) => (
                <div key={label} style={{ flex: 1 }}>
                  <div style={{ height: 3, borderRadius: 4, background: done ? "#BE2B1A" : "#E0D5C8", marginBottom: 5 }} />
                  <div style={{ fontSize: 9, color: done ? "#BE2B1A" : "#BFB0A0", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ ...S.chip, display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}><span className="material-symbols-outlined" style={{ fontSize: 13 }}>build</span>Mechanic · Step 2 of 3</div>
            <div style={S.heading}>Your Details</div>
            <div style={S.sub}>Tell us about yourself and your workshop.</div>

            {error && <div style={S.error}>{error}</div>}

            <label style={S.label}>Full Name <span style={{ color: "#DC2626" }}>*</span></label>
            <input className="auth-input" style={{ ...S.input, marginBottom: 14 }} placeholder="e.g. Raju Mechanics" value={mechDetails.name} onChange={e => { setMechDetails(d => ({ ...d, name: e.target.value })); setError(""); }} autoFocus />

            <label style={S.label}>Mobile Number <span style={{ color: "#DC2626" }}>*</span></label>
            <div style={{ ...S.phoneRow, marginBottom: 14 }}>
              <div style={S.phoneFlag}>IN +91</div>
              <input className="auth-input" style={S.phoneInput} placeholder="98765 43210" maxLength={10} inputMode="numeric"
                value={mechDetails.phone} onChange={e => setMechDetails(d => ({ ...d, phone: e.target.value.replace(/\D/g, "") }))} />
            </div>

            <label style={S.label}>Mechanic Shop Name</label>
            <input className="auth-input" style={{ ...S.input, marginBottom: 14 }} placeholder="e.g. Raju Auto Works" value={mechDetails.shopName} onChange={e => setMechDetails(d => ({ ...d, shopName: e.target.value }))} />

            <label style={S.label}>Shop Location / Area</label>
            <input className="auth-input" style={{ ...S.input, marginBottom: 24 }} placeholder="e.g. Kukatpally, Hyderabad" value={mechDetails.shopLocation} onChange={e => setMechDetails(d => ({ ...d, shopLocation: e.target.value }))} />

            <button className="btn-primary" style={S.btnPrimary(loading || !mechDetails.name.trim() || !mechDetails.phone.trim())}
              disabled={loading || !mechDetails.name.trim() || !mechDetails.phone.trim()}
              onClick={submitMechanicRegistration}>
              {loading ? "Sending verification…" : "Verify Email →"}
            </button>
          </div>
        );

      // ══════════════════════════════════════════════════════════════════════
      // PENDING — shop owner awaiting approval
      // ══════════════════════════════════════════════════════════════════════
      case STEPS.PENDING:
        return (
          <div className="auth-card" style={{ textAlign: "center" }}>
            {/* Progress — all 3 done */}
            <div style={{ display: "flex", gap: 6, marginBottom: 28 }}>
              {["Identity", "Shop Details", "Under Review"].map(label => (
                <div key={label} style={{ flex: 1 }}>
                  <div style={{ height: 3, borderRadius: 4, background: "#BE2B1A", marginBottom: 5 }} />
                  <div style={{ fontSize: 9, color: "#BE2B1A", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#FEF2F2", border: `2px solid #BE2B1A`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", boxShadow: `0 0 28px rgba(190,43,26,0.18)` }}><span className="material-symbols-outlined" style={{ fontSize: 34, color: "#BE2B1A" }}>hourglass_empty</span></div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1A1205", marginBottom: 10 }}>Application Submitted!</div>
            <div style={{ fontSize: 14, color: "#9C8C7C", lineHeight: 1.7, marginBottom: 24, maxWidth: 340, margin: "0 auto 24px" }}>
              Your shop details are under review. We'll email you once approved — usually within <strong style={{ color: "#BE2B1A" }}>24–48 hours</strong>.
            </div>
            <div style={{ background: "#FAF6F0", border: `1px solid #E0D5C8`, borderRadius: 12, padding: "18px 20px", marginBottom: 24, textAlign: "left" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#BE2B1A", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>What happens next</div>
              {[
                { icon: "check_circle", label: "Account created & shop details submitted", done: true },
                { icon: "manage_search", label: "Our team reviews your application (24–48 hrs)", done: false },
                { icon: "email", label: "You receive an approval email with login link", done: false },
                { icon: "storefront", label: "Log in and start managing your shop!", done: false },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: i < 3 ? 12 : 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, flexShrink: 0, opacity: item.done ? 1 : 0.45, color: "#BE2B1A" }}>{item.icon}</span>
                  <span style={{ fontSize: 13, color: item.done ? "#1A1205" : "#9C8C7C", fontWeight: item.done ? 600 : 400, lineHeight: 1.5 }}>{item.label}</span>
                </div>
              ))}
            </div>
            <button style={{ ...S.btnOutline }} onClick={() => { go(STEPS.LANDING); setRole(""); }}>← Back to Home</button>
          </div>
        );

      // ══════════════════════════════════════════════════════════════════════
      // REJECTED — shop owner application not approved
      // ══════════════════════════════════════════════════════════════════════
      case STEPS.REJECTED:
        return (
          <div className="auth-card" style={{ textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#FEF2F2", border: `2px solid #DC2626`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 20px" }}>✕</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#1A1205", marginBottom: 10 }}>Application Not Approved</div>
            {rejectionMsg && (
              <div style={{ background: "#FEF2F2", border: `1px solid #FECACA`, borderRadius: 10, padding: "14px 16px", marginBottom: 20, fontSize: 13, color: "#DC2626", lineHeight: 1.6, textAlign: "left" }}>
                <strong>Reason:</strong> {rejectionMsg}
              </div>
            )}
            <div style={{ fontSize: 13, color: "#9C8C7C", marginBottom: 24, lineHeight: 1.7 }}>
              If you believe this is a mistake, contact our support team at <strong style={{ color: "#BE2B1A" }}>support@redpiston.in</strong>
            </div>
            <button style={{ ...S.btnOutline }} onClick={() => { go(STEPS.LANDING); setRole(""); }}>← Back to Home</button>
          </div>
        );

      // ══════════════════════════════════════════════════════════════════════
      // ADMIN AUTH — platform admin console login
      // ══════════════════════════════════════════════════════════════════════
      case STEPS.ADMIN_AUTH:
        return (
          <div className="auth-card" style={{ border: "1.5px solid #E4DAFB", borderRadius: 16, background: "#FFFFFF", padding: "32px 32px 28px", boxShadow: "0 8px 32px rgba(124,58,237,0.10)" }}>
            {/* No "Back" when this is the app's only entry point — LANDING's
                shop/customer/mechanic picker doesn't apply to this app. */}
            {initialStep !== STEPS.ADMIN_AUTH && (
              <button style={{ ...S.btnBack, color: "#7C3AED" }} onClick={() => go(STEPS.LANDING)}>← Back</button>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #4F46E5, #7C3AED)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 14px rgba(124,58,237,0.3)" }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 6v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6l-8-4Z" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#7C3AED", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Inter', sans-serif" }}>Platform Admin Console</div>
                <div style={{ fontSize: 11, color: "#9C8C7C", marginTop: 1 }}>Restricted access · Authorised personnel only</div>
              </div>
            </div>
            <div style={{ ...S.heading, marginBottom: 4 }}>Admin Sign In</div>
            <div style={{ ...S.sub, marginBottom: 22 }}>Sign in with your platform admin credentials.</div>
            {error && <div style={S.error}>{error}</div>}
            <label style={S.label}>Admin Email</label>
            <input className="auth-input admin-input" style={{ ...S.input, marginBottom: 14 }} type="email" name="email" autoComplete="email" placeholder="admin@redpiston.in" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
            <label style={S.label}>Password</label>
            <div style={{ position: "relative", marginBottom: 22 }}>
              <input className="auth-input admin-input" style={{ ...S.input, paddingRight: 44 }} type={showPwd ? "text" : "password"} name="password" autoComplete="current-password" placeholder="Admin password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && adminSignIn()} />
              <button onClick={() => setShowPwd(p => !p)} aria-label={showPwd ? "Hide password" : "Show password"} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#9C8C7C", cursor: "pointer", lineHeight: 0, padding: 4 }}>
                {showPwd
                  ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
              </button>
            </div>
            <button
              className="btn-primary"
              style={{ ...S.btnPrimary(loading || googleLoading), background: loading ? "#E0D5C8" : "linear-gradient(135deg, #4F46E5, #7C3AED)", boxShadow: loading ? "none" : "0 8px 24px rgba(124,58,237,0.28)" }}
              disabled={loading || googleLoading} onClick={adminSignIn}>
              {loading ? <><span className="auth-spinner" />Signing in…</> : "Access Console →"}
            </button>
            <div style={S.divider}><div style={S.dividerLine}/><span style={S.dividerText}>OR</span><div style={S.dividerLine}/></div>
            <button className="btn-google" style={{ ...S.btnGoogle, opacity: loading || googleLoading ? 0.6 : 1, cursor: loading || googleLoading ? "not-allowed" : "pointer" }} disabled={loading || googleLoading} onClick={adminGoogleSignIn}>
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              {googleLoading ? "Signing in…" : "Continue with Google"}
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  // ─── Page layout — Stitch "Precision Industrial" split panel ────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: isModal ? "100%" : undefined, minHeight: isModal ? "100%" : "100vh", background: isModal ? "#FFFFFF" : "#FAF6F0", fontFamily: "'Inter', sans-serif" }}>
      <style>{css}</style>


      {/* ── Content area: hero + form ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: isModal ? "column" : "row", minHeight: 0 }}>

      {/* ── Left: Engine photo + branding — standalone page only. The modal is a
           focused single-column login card with no side image. ── */}
      {!isModal && (
      <div className="auth-hero-left" style={{ width: "58%", position: "relative", overflow: "hidden", flexShrink: 0 }}>
        {/* Engine photo */}
        {/* loading="lazy" + fetchpriority="low": hero image is decorative, not LCP.
            w=900 serves half the pixels vs w=1932 — panel is never wider than ~800px. */}
        <img
          src="https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&q=75&w=900"
          srcSet="https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&q=75&w=900 900w, https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&q=75&w=1400 1400w"
          sizes="(max-width: 1200px) 900px, 1400px"
          alt="Precision automotive engineering"
          loading="lazy"
          fetchPriority="low"
          decoding="async"
          style={{ width: "100%", height: "100%", objectFit: "cover", filter: isAdminEntry ? "grayscale(60%) brightness(0.5)" : "grayscale(15%) brightness(0.75)", display: "block" }}
          onError={e => { e.target.style.background = "#1a1c1e"; e.target.style.display = "none"; }}
        />
        {/* Overlay — a cooler, more saturated violet wash for the admin entry
            point distinguishes it from the warm maroon marketplace/shop hero,
            while keeping the same photo/layout so this stays one shared file. */}
        <div className="auth-left-overlay" style={isAdminEntry ? { background: "linear-gradient(160deg, rgba(20,10,50,0.55) 0%, rgba(10,6,26,0.88) 100%)" } : undefined} />

        {/* Content */}
        <div className="auth-left-content">
          {/* Logo — top */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, overflow: "hidden", border: `1.5px solid ${isAdminEntry ? "rgba(196,181,253,0.35)" : "rgba(255,255,255,0.22)"}`, flexShrink: 0, boxShadow: "0 2px 10px rgba(0,0,0,0.45)" }}>
              <img src="/logo.png" alt="RedPiston" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#e2e2e5", fontFamily: "'Plus Jakarta Sans','Inter',sans-serif", lineHeight: 1 }}>RedPiston</div>
              <div style={{ fontSize: 9, color: isAdminEntry ? "#C4B5FD" : "#ffb4a7", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 3 }}>
                {isAdminEntry ? "Operations Console" : "Auto Parts Platform"}
              </div>
            </div>
          </div>

          {isAdminEntry ? (
            <>
              {/* Headline — middle */}
              <div style={{ maxWidth: 380 }}>
                <div style={{ fontSize: 34, fontWeight: 800, color: "#e2e2e5", fontFamily: "'Plus Jakarta Sans','Inter',sans-serif", lineHeight: 1.15, marginBottom: 14, letterSpacing: "-0.02em" }}>
                  Platform control, centralized.
                </div>
                <div style={{ fontSize: 13, color: "#C9BFEA", lineHeight: 1.6, maxWidth: 340 }}>
                  Verify shops, manage the platform-wide parts catalog, review the user directory, and monitor system health — all from one console.
                </div>
              </div>

              {/* Status row — bottom, replaces the customer-facing "social proof"
                  avatars with something an internal ops console actually shows. */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E", display: "block", boxShadow: "0 0 8px rgba(34,197,94,0.6)" }} />
                <span style={{ fontSize: 11, color: "#C9BFEA", fontWeight: 500, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em" }}>Internal tool · Staff access only</span>
              </div>
            </>
          ) : (
            <>
              {/* Headline — middle */}
              <div style={{ maxWidth: 380 }}>
                <div style={{ fontSize: 34, fontWeight: 800, color: "#e2e2e5", fontFamily: "'Plus Jakarta Sans','Inter',sans-serif", lineHeight: 1.15, marginBottom: 14, letterSpacing: "-0.02em" }}>
                  Precision Built for Industrial Excellence.
                </div>
                <div style={{ fontSize: 13, color: "#e3beb8", lineHeight: 1.6, maxWidth: 340 }}>
                  Access India's most complete auto parts platform — inventory, billing, fitment-guaranteed marketplace, and udhaar ledger.
                </div>
              </div>

              {/* Social proof — bottom */}
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ display: "flex" }}>
                  {[
                    { bg: "#be2b1a", icon: "build" },
                    { bg: "#282a2c", icon: "settings" },
                    { bg: "#1e2022", icon: "directions_car" },
                  ].map((a, i) => (
                    <div key={i} style={{ width: 30, height: 30, borderRadius: "50%", border: "2px solid #121416", background: a.bg, marginLeft: i > 0 ? -8 : 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#ffd9d3" }}>{a.icon}</span>
                    </div>
                  ))}
                  <div style={{ width: 30, height: 30, borderRadius: "50%", border: "2px solid #121416", background: "#be2b1a", marginLeft: -8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#ffd9d3", fontFamily: "'JetBrains Mono',monospace" }}>+2k</div>
                </div>
                <span style={{ fontSize: 11, color: "#e3beb8", fontWeight: 500 }}>Verified Industry Professionals</span>
              </div>
            </>
          )}
        </div>
      </div>
      )}

      {/* ── Right: Form panel ── */}
      <div className="auth-form-right" style={{
        flex: 1, background: "#FFFFFF",
        backgroundImage: "radial-gradient(rgba(190,43,26,0.06) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
        display: "flex", flexDirection: "column",
        alignItems: "center",
        /* No justifyContent:center — it clips the top of tall forms (SHOP_DETAILS).
           On the standalone page the inner form container uses margin:auto to stay
           centered; the modal is auto-height so its content sits at the top. */
        padding: isModal ? "48px 32px 20px" : "32px 48px",
        position: "relative", overflowY: "auto",
      }}>
        {/* Live badge */}
        {!isModal && <div style={{ position: "absolute", top: 24, right: 24, display: "flex", alignItems: "center", gap: 8, background: "#FFFFFF", border: "1px solid #E0D5C8", borderRadius: 9999, padding: "6px 14px", boxShadow: "0 1px 4px rgba(26,18,5,0.06)" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10B981", display: "block", boxShadow: "0 0 8px rgba(16,185,129,0.6)", animation: "auth-pulse 2s infinite" }} />
          <span style={{ fontSize: 10, color: "#9C8C7C", fontFamily: "'JetBrains Mono',monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>Secure Access</span>
        </div>}

        {/* Brand mark — modal only, replaces the removed top bar */}
        {isModal && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, overflow: "hidden", border: "1.5px solid #E0D5C8", flexShrink: 0, boxShadow: "0 1px 6px rgba(26,18,5,0.08)" }}>
              <img src="/logo.png" alt="RedPiston" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#1A1205", fontFamily: "'Plus Jakarta Sans','Inter',sans-serif", lineHeight: 1 }}>RedPiston</div>
              <div style={{ fontSize: 8, color: "#BE2B1A", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 3 }}>Auto Parts Platform</div>
            </div>
          </div>
        )}

        {/* Mobile branding */}
        <div style={{ display: "none" }} className="auth-mobile-brand">
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#BE2B1A", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>RedPiston</div>
          </div>
        </div>

        {/* Auth block — brand lockup + form, vertically centered as one group on
            the full-screen panel. margin:auto keeps it centered on short steps and
            lets it scroll from the top on tall ones (SHOP_DETAILS). The modal shows
            the brand lockup here since the side hero is removed. */}
        <div style={{ width: "100%", maxWidth: isModal ? 440 : ((step === STEPS.LANDING || step === STEPS.REG_ROLE) ? 580 : 440), marginTop: isModal ? 0 : "auto", marginBottom: isModal ? 0 : "auto", paddingTop: isModal ? 0 : 24, paddingBottom: isModal ? 0 : 24 }}>
          {renderStep()}
        </div>

        {/* Role mismatch popup — shown when user tries mechanic tab but account exists as a different role */}
        {roleMismatch && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30, backdropFilter: "blur(4px)" }}>
            <div style={{ background: "#FFFFFF", borderRadius: 16, padding: "28px 28px 24px", maxWidth: 360, width: "calc(100% - 40px)", boxShadow: "0 8px 40px rgba(0,0,0,0.18)", fontFamily: "'Inter', sans-serif" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#1A1A1A", marginBottom: 8, textAlign: "center", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Account Already Exists</div>
              <div style={{ fontSize: 13, color: "#5C4F40", lineHeight: 1.55, marginBottom: 22, textAlign: "center" }}>
                This email is linked to a <strong>{roleMismatch.user.role === "SHOP_OWNER" ? "Shop Owner" : "Customer"}</strong> account.
                Would you like to create a separate Mechanic account or continue as {roleMismatch.user.role === "SHOP_OWNER" ? "Shop Owner" : "Customer"}?
              </div>
              {roleMismatch.user.role === "CUSTOMER" && (
                <button
                  onClick={async () => {
                    try {
                      const res = await api.post("/api/mechanic-auth/convert-to-mechanic", {});
                      const user = { ...(roleMismatch.user || {}), ...(res as any)?.user, role: "MECHANIC" };
                      setRoleMismatch(null);
                      setPendingUser(user);
                      go(STEPS.MECHANIC_DETAILS);
                    } catch (e) { setError(getErr(e, "Conversion failed. Try again.")); }
                  }}
                  style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: "#BE2B1A", color: "#FFFFFF", fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 10, fontFamily: "'Inter', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                  Convert to Mechanic Account
                </button>
              )}
              <button
                onClick={() => { setRoleMismatch(null); setRole("mechanic"); setEmail(""); setPassword(""); setConfirmPwd(""); setHideGoogleForMechanic(true); go(STEPS.REG_AUTH); }}
                style={{ width: "100%", padding: "11px 0", borderRadius: 10, border: "1.5px solid #E0D5C8", background: "#FAF6F0", color: "#5C4F40", fontWeight: 600, fontSize: 14, cursor: "pointer", marginBottom: 10, fontFamily: "'Inter', sans-serif" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: "middle" }}>build</span> Create New Mechanic Account
              </button>
              <button
                onClick={() => { setRoleMismatch(null); localStorage.setItem("as_user", JSON.stringify(roleMismatch.user)); onLogin(roleMismatch.user); }}
                style={{ width: "100%", padding: "11px 0", borderRadius: 10, border: "1.5px solid #E0D5C8", background: "#FAF6F0", color: "#5C4F40", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>
                Continue as {roleMismatch.user.role === "SHOP_OWNER" ? "Shop Owner" : "Customer"}
              </button>
            </div>
          </div>
        )}

        {/* Transition overlay — shown briefly while navigating from email form to shop details */}
        {settingUp && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.92)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20, backdropFilter: "blur(3px)" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ marginBottom: 18 }}><span className="auth-spinner-dark" style={{ width: 36, height: 36, border: "3.5px solid rgba(190,43,26,0.2)", borderTopColor: "#BE2B1A" }} /></div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#BE2B1A", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Setting up your shop…</div>
              <div style={{ fontSize: 12, color: "#9C8C7C", marginTop: 6 }}>Just a moment</div>
            </div>
          </div>
        )}

        {/* Footer links — only on main auth steps, not in modal */}
        {!isModal && (step === STEPS.LANDING || step === STEPS.SIGNIN) && (
          <div style={{ width: "100%", maxWidth: 400, marginTop: 32, paddingTop: 24, borderTop: "1px solid #E0D5C8", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "#9C8C7C", marginBottom: 14 }}>
              New to the platform?{" "}
              <button
                style={{ background: "none", border: "none", color: "#BE2B1A", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "'Inter', sans-serif" }}
                onClick={() => go(STEPS.REG_ROLE)}
              >
                Register a Shop
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 24 }}>
              <span style={{ fontSize: 10, color: "#BFB0A0", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", letterSpacing: "0.06em" }}>TERMS OF SERVICE</span>
              <span style={{ fontSize: 10, color: "#BFB0A0", fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", letterSpacing: "0.06em" }}>PRIVACY POLICY</span>
            </div>
          </div>
        )}
      </div>
      {isModal && (
        <footer style={{ background: "#F8F4EF", borderTop: "1px solid #E8DDD4", padding: "14px 24px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "#9C8C7C", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.04em" }}>© {new Date().getFullYear()} RedPiston</span>
            {[
              { label: "Privacy Policy", href: "#" },
              { label: "Terms of Service", href: "#" },
              { label: "Contact", href: "mailto:support@redpiston.com" },
            ].map(l => (
              <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#D4C8BA", fontSize: 10 }}>·</span>
                <a href={l.href} style={{ fontSize: 11, color: "#9C8C7C", textDecoration: "none", fontFamily: "'Inter',sans-serif", transition: "color 0.15s" }}
                  onMouseEnter={e => { (e.target as HTMLAnchorElement).style.color = "#BE2B1A"; }}
                  onMouseLeave={e => { (e.target as HTMLAnchorElement).style.color = "#9C8C7C"; }}>
                  {l.label}
                </a>
              </span>
            ))}
          </div>
        </footer>
      )}
      </div>{/* end content area */}

      {/* Marketplace/shop footer (About, socials, OEM/OES brand links) — not
          relevant to a single-purpose internal admin console. */}
      {!isModal && !isAdminEntry && (<footer className="auth-footer" style={{ background: "#F1EDE8", borderTop: "1px solid #E0D5C8", padding: "56px 48px 32px", fontFamily: "'Inter', sans-serif" }}>
          <div className="auth-footer-grid" style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "48px 32px" }}>

            {/* Brand column */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, overflow: "hidden", border: "1.5px solid #E0D5C8", flexShrink: 0, background: "#fff" }}>
                  <img src="/logo.png" alt="RedPiston" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#1A1205", fontFamily: "'Plus Jakarta Sans',sans-serif", lineHeight: 1 }}>RedPiston</div>
                  <div style={{ fontSize: 9, color: "#BE2B1A", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 3 }}>Auto Parts Platform</div>
                </div>
              </div>
              <p style={{ fontSize: 13, color: "#5C4F40", lineHeight: 1.65, maxWidth: 260, margin: "0 0 20px" }}>
                India's trusted ERP for auto parts shops — billing, inventory &amp; fitment-guaranteed marketplace.
              </p>
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                {[
                  { label: "Facebook", href: "#", icon: <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg> },
                  { label: "Instagram", href: "#", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg> },
                  { label: "LinkedIn", href: "#", icon: <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg> },
                ].map(s => (
                  <a key={s.label} href={s.href} aria-label={s.label} className="auth-footer-social" style={{ width: 36, height: 36, borderRadius: "50%", background: "#fff", border: "1.5px solid #E0D5C8", display: "flex", alignItems: "center", justifyContent: "center", color: "#5C4F40", textDecoration: "none", transition: "all 0.18s", flexShrink: 0 }}>
                    {s.icon}
                  </a>
                ))}
              </div>
              <div style={{ fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: "#BE2B1A", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em" }}>Contact: </span>
                <a href="mailto:support@redpiston.com" className="auth-footer-link" style={{ color: "#5C4F40", textDecoration: "none" }}>support@redpiston.com</a>
              </div>
            </div>

            {/* About */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#1A1205", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 20, fontFamily: "'JetBrains Mono',monospace" }}>About</div>
              {["About us", "Contact us", "Blogs", "FAQ"].map(link => (
                <div key={link} style={{ marginBottom: 14 }}>
                  <a href="#" className="auth-footer-link" style={{ fontSize: 14, color: "#5C4F40", textDecoration: "none" }}>{link}</a>
                </div>
              ))}
            </div>

            {/* Policy */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#1A1205", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 20, fontFamily: "'JetBrains Mono',monospace" }}>Policy</div>
              {["Return Policy", "Privacy Policy", "Disclaimer", "Terms of Use"].map(link => (
                <div key={link} style={{ marginBottom: 14 }}>
                  <a href="#" className="auth-footer-link" style={{ fontSize: 14, color: "#5C4F40", textDecoration: "none" }}>{link}</a>
                </div>
              ))}
            </div>

            {/* Useful Links */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#1A1205", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 20, fontFamily: "'JetBrains Mono',monospace" }}>Useful Links</div>
              {["Category", "OEM Brands", "OES Brands"].map(link => (
                <div key={link} style={{ marginBottom: 14 }}>
                  <a href="#" className="auth-footer-link" style={{ fontSize: 14, color: "#5C4F40", textDecoration: "none" }}>{link}</a>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{ maxWidth: 1200, margin: "32px auto 0", paddingTop: 24, borderTop: "1px solid #E0D5C8", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 12, color: "#9C8C7C" }}>© {new Date().getFullYear()} RedPiston. All rights reserved.</div>
            <div style={{ fontSize: 12, color: "#9C8C7C" }}>Made in India 🇮🇳</div>
          </div>
        </footer>)}
    </div>
  );
}
