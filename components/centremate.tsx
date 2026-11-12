"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  MapPin,
  Search,
  Users,
  ShieldCheck,
  Route,
  ChevronDown,
  Navigation,
  Plus,
  Check,
  Share2,
  LogOut,
  ArrowLeft,
  MessageCircle,
  X,
  GraduationCap,
  Building2,
  Loader2,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Button } from "./ui/button";
import { browserClient, configured } from "@/lib/supabase";
type Exam = { id: string; name: string; exam_date: string };
type Centre = { id: string; name: string; address: string; total?: number };
type Mate = {
  id: string;
  name: string;
  hostel: string;
  departure: string | null;
  going: boolean;
  ready_until: string | null;
  has_contact: boolean;
};
const db = configured ? browserClient() : null;
export default function CentreMate({ centreId }: { centreId?: string }) {
  const [user, setUser] = useState<User | null>(null),
    [approved, setApproved] = useState(false),
    [admin, setAdmin] = useState(false),
    [exams, setExams] = useState<Exam[]>([]),
    [centres, setCentres] = useState<Centre[]>([]),
    [exam, setExam] = useState(""),
    [query, setQuery] = useState(""),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState(""),
    [modal, setModal] = useState<"register" | "request" | null>(null),
    [mates, setMates] = useState<Mate[]>([]),
    [tab, setTab] = useState("Everyone"),
    [busy, setBusy] = useState(false),
    [own, setOwn] = useState<Record<string, unknown> | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!modal || !dialog) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
    };
  }, [modal]);
  const centre = centres.find((c) => c.id === centreId);
  const ownAtCentre = own?.centre_id === centreId;
  const load = useCallback(async () => {
    if (new URLSearchParams(location.search).has("error"))
      setMessage("Google sign-in could not complete. Please try again.");
    if (!db) {
      setLoading(false);
      return;
    }
    const {
      data: { user: u },
    } = await db.auth.getUser();
    setUser(u);
    const [{ data: e, error: ee }, { data: c, error: ce }] = await Promise.all([
      db.from("exams").select("*").eq("active", true).order("exam_date"),
      db.from("centres").select("*").order("name"),
    ]);
    if (ee || ce)
      setMessage("We could not load the directory. Please try again.");
    setExams(e || []);
    setCentres(c || []);
    const requested = new URLSearchParams(location.search).get("exam");
    setExam(
      (prev) =>
        prev ||
        (e?.some((item) => item.id === requested)
          ? requested!
          : (e?.[0]?.id ?? "")),
    );
    if (u) {
      const { data: a } = await db.rpc("is_approved");
      setApproved(!!a);
      const { data: ad } = await db.rpc("is_admin");
      setAdmin(!!ad);
    } else {
      setApproved(false);
      setAdmin(false);
      setMates([]);
      setOwn(null);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    const init = setTimeout(() => void load(), 0);
    const listener = db?.auth.onAuthStateChange(() => {
      void load();
    });
    return () => {
      clearTimeout(init);
      listener?.data.subscription.unsubscribe();
    };
  }, [load]);
  const refresh = useCallback(async () => {
    if (!db || !exam || !approved) return;
    const { data: counts } = await db.rpc("centre_counts", { p_exam: exam });
    setCentres((prev) =>
      prev.map((c) => ({
        ...c,
        total:
          counts?.find(
            (n: { centre_id: string; total: number }) => n.centre_id === c.id,
          )?.total ?? 0,
      })),
    );
    if (centreId) {
      const { data, error } = await db.rpc("directory", {
        p_exam: exam,
        p_centre: centreId,
      });
      if (error) setMessage(error.message);
      setMates(data || []);
    }
    const { data: r } = await db
      .from("registrations")
      .select("*")
      .eq("exam_id", exam)
      .eq("email", user?.email?.toLowerCase() ?? "")
      .maybeSingle();
    setOwn(r);
  }, [exam, approved, centreId, user?.email]);
  useEffect(() => {
    const init = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => {
      void refresh();
    }, 30000);
    return () => {
      clearTimeout(init);
      clearInterval(timer);
    };
  }, [refresh]);
  async function login() {
    if (!db) {
      setMessage(
        "Google sign-in will be available once the Supabase project is connected.",
      );
      return;
    }
    const { error } = await db.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + "/auth/callback" },
    });
    if (error) setMessage(error.message);
  }
  function register() {
    if (!user) {
      void login();
      return;
    }
    if (!approved) {
      setMessage(
        "Your verified email is not yet approved. Ask a CentreMate admin to add your Scaler email domain or an email exception.",
      );
      return;
    }
    if (!exam) {
      setMessage("Choose an exam first.");
      return;
    }
    setModal("register");
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !user) return;
    setBusy(true);
    const f = new FormData(event.currentTarget);
    const payload = {
      email: user.email!.toLowerCase(),
      exam_id: exam,
      centre_id: String(f.get("centre_id")),
      name: String(f.get("name")).trim(),
      hostel: String(f.get("hostel")),
      departure: f.get("departure") || null,
      whatsapp:
        String(f.get("whatsapp") || "").replace(/[\s+()-]/g, "") || null,
      visible: f.get("visible") === "on",
      going: f.get("going") === "on",
      source: "website",
      ready_until: null,
    };
    const { error } = await db
      .from("registrations")
      .upsert(payload, { onConflict: "exam_id,email" });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setModal(null);
    setMessage("Your registration is saved. You can update it anytime.");
    await refresh();
  }
  async function returnReady() {
    if (!db || !own) return;
    const { error } = await db
      .from("registrations")
      .update({
        ready_until:
          own.ready_until && new Date(String(own.ready_until)) > new Date()
            ? null
            : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        source: "website",
      })
      .eq("id", own.id);
    if (error) setMessage(error.message);
    await refresh();
  }
  async function remove() {
    if (!db || !own || !confirm("Delete your registration for this exam?"))
      return;
    const { error } = await db.from("registrations").delete().eq("id", own.id);
    if (error) setMessage(error.message);
    else {
      setOwn(null);
      setMessage("Registration deleted.");
      await refresh();
    }
  }
  async function contact(id: string) {
    const { data, error } = await db!.rpc("contact", { p_registration: id });
    if (error || !data) {
      setMessage(
        "Register for this exam at this centre to access shared WhatsApp contacts.",
      );
      return;
    }
    window.open("https://wa.me/" + data, "_blank", "noopener,noreferrer");
  }
  const filtered = centres.filter((c) =>
    (c.name + " " + c.address).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <header>
        <a className="brand" href="/">
          <span className="brand-icon">
            <Route size={23} />
          </span>
          Centre<span>Mate</span>
          <span className="beta">BETA</span>
        </a>
        <nav>
          <a className={!centreId ? "active" : ""} href="/#directory">
            Find your centre
          </a>
          <a href="/#how-it-works">How it works</a>
        </nav>
        <div className="header-actions">
          {own && (
            <a
              className="my-plans"
              href={"/centre/" + own.centre_id + "?exam=" + exam}
            >
              My plans
            </a>
          )}
          {admin && <a href="/admin">Admin</a>}
          {user ? (
            <button
              className="user-button"
              onClick={async () => {
                await db?.auth.signOut();
                location.replace(new URL("/", location.origin));
              }}
              title="Sign out"
            >
              <span>{user.email?.split("@")[0]}</span>
              <LogOut size={16} />
            </button>
          ) : (
            <Button variant="outline" onClick={login}>
              Sign in <ArrowUpRight size={15} />
            </Button>
          )}
        </div>
      </header>
      <main>
        {!centreId ? (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span /> FOR SCALER × IITM BS STUDENTS
                </div>
                <h1>
                  Same centre.
                  <br />
                  <span>Better company.</span>
                </h1>
                <p>
                  Exam day is better when you don’t go alone.
                  <br className="desktop" /> Find your people, share a ride, and
                  head back together.
                </p>
                <div className="hero-buttons">
                  <Button asChild>
                    <a href="#directory">
                      Find my exam centre <ArrowRight size={18} />
                    </a>
                  </Button>
                  <a className="text-link" href="#how-it-works">
                    How it works <ArrowUpRight size={16} />
                  </a>
                </div>
                <div className="trust">
                  <ShieldCheck size={17} /> Just your Scaler community. Always
                  your choice.
                </div>
              </div>
              <div
                className="hero-art"
                aria-label="An illustrated shared route from both hostels to one exam centre"
              >
                <div className="art-grid" />
                <span className="art-label">
                  A LITTLE LESS LOGISTICS. A LOT MORE TOGETHER.
                </span>
                <svg className="route-lines" viewBox="0 0 500 340" fill="none">
                  <path
                    d="M100 105 C260 105 90 240 325 215 M125 275 C260 275 180 215 325 215"
                    stroke="#93b5f5"
                    strokeWidth="3"
                    strokeDasharray="7 8"
                  />
                  <circle cx="325" cy="215" r="50" fill="#e4edff" />
                  <circle cx="325" cy="215" r="35" fill="#d2e2ff" />
                </svg>
                <div className="hostel-label hostel-one">
                  <span className="small-icon">
                    <Building2 size={21} />
                  </span>
                  <div>
                    <b>Uni 1</b>
                    <small>Your starting point</small>
                  </div>
                  <span className="dot blue" />
                </div>
                <div className="hostel-label hostel-two">
                  <span className="small-icon peach">
                    <Building2 size={21} />
                  </span>
                  <div>
                    <b>Uni 2</b>
                    <small>Your starting point</small>
                  </div>
                  <span className="dot orange" />
                </div>
                <div className="destination">
                  <MapPin size={30} fill="currentColor" stroke="white" />
                </div>
                <div className="centre-label">
                  <b>One exam centre.</b>
                  <span>One shared journey.</span>
                </div>
                <div className="art-note">
                  <span className="avatars">
                    <i>A</i>
                    <i>S</i>
                    <i>R</i>
                  </span>
                  <div>
                    Different hostels.
                    <br />
                    <b>Same team.</b>
                  </div>
                  <span className="note-check">
                    <Check size={16} />
                  </span>
                </div>
                <span className="decor-star">✦</span>
              </div>
            </section>
            <div className="value-strip">
              <span>
                <Users size={19} /> Uni 1 + Uni 2, together
              </span>
              <span>
                <Route size={19} /> Split the ride, share the journey
              </span>
              <span>
                <ShieldCheck size={19} /> Your details stay in your control
              </span>
            </div>
          </>
        ) : (
          <a href="/#directory" className="back">
            <ArrowLeft size={16} /> All exam centres
          </a>
        )}
        <section id="directory" className="directory">
          <div className="section-top">
            <div>
              <div className="eyebrow">
                {centreId ? "YOUR EXAM DAY CREW" : "FIND YOUR PEOPLE"}
              </div>
              <h2>
                {centreId
                  ? (centre?.name ?? "Exam centre")
                  : "Where’s your exam?"}
              </h2>
              <p>
                {centreId
                  ? (centre?.address ?? "Loading centre details…")
                  : "Pick your exam and find the centre on your hall ticket."}
              </p>
            </div>
            <div className="exam-select">
              <GraduationCap size={19} />
              <select
                aria-label="Select examination"
                value={exam}
                onChange={(e) => {
                  setExam(e.target.value);
                  const url = new URL(location.href);
                  url.searchParams.set("exam", e.target.value);
                  history.replaceState(null, "", url);
                }}
              >
                {!exams.length && (
                  <option value="">No upcoming exams yet</option>
                )}
                {exams.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ·{" "}
                    {new Date(e.exam_date + "T12:00:00").toLocaleDateString(
                      "en-IN",
                      { day: "numeric", month: "short" },
                    )}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} />
            </div>
          </div>
          {message && (
            <div className="notice" role="status">
              {message}
              <button onClick={() => setMessage("")} aria-label="Dismiss">
                <X size={17} />
              </button>
            </div>
          )}
          {user && !approved && (
            <div className="notice">
              Directory access is limited to verified, approved Scaler emails.
              Your account is signed in but awaiting approval.
            </div>
          )}
          {!centreId ? (
            <>
              <div className="search-row">
                <div className="search">
                  <Search size={20} />
                  <input
                    placeholder="Search by centre name or location"
                    aria-label="Search centres"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      onClick={() => setQuery("")}
                      aria-label="Clear search"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <span className="directory-count">
                  {filtered.length} centres
                </span>
              </div>
              {loading ? (
                <div className="empty">
                  <Loader2 className="spin" /> Loading centres…
                </div>
              ) : filtered.length ? (
                <div className="centre-grid">
                  {filtered.map((c, i) => (
                    <a
                      className="centre-card"
                      key={c.id}
                      href={"/centre/" + c.id + "?exam=" + exam}
                    >
                      <div className="card-top">
                        <span className={"map-icon map-" + (i % 3)}>
                          <MapPin size={24} />
                        </span>
                        <ArrowUpRight size={19} />
                      </div>
                      <h3>{c.name}</h3>
                      <p>{c.address}</p>
                      <div className="card-bottom">
                        <span>
                          <Users size={16} />
                          {approved
                            ? `${c.total ?? 0} students`
                            : "Sign in to see your people"}
                        </span>
                        <span className="view-centre">
                          View centre <ArrowRight size={15} />
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="empty">
                  <span className="empty-icon">
                    <MapPin size={30} />
                  </span>
                  <h3>
                    {query
                      ? "No matching centres"
                      : "Your next journey starts here"}
                  </h3>
                  <p>
                    {query
                      ? "Try a different name or request your missing centre."
                      : "Upcoming exams and verified centres will appear here once your coordinator adds them."}
                  </p>
                  {!configured && (
                    <small>
                      CentreMate is being set up. No student information is
                      displayed.
                    </small>
                  )}
                  {admin && (
                    <Button asChild variant="outline">
                      <a href="/admin">
                        Set up your first exam <ArrowRight size={16} />
                      </a>
                    </Button>
                  )}
                </div>
              )}
              <div className="request-card">
                <div>
                  <span className="small-icon">
                    <MapPin size={21} />
                  </span>
                  <div>
                    <b>Can’t find your centre?</b>
                    <p>We’ll help get it on the map.</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!approved) {
                      setMessage(
                        "Sign in with an approved Scaler account to request a centre.",
                      );
                      return;
                    }
                    setModal("request");
                  }}
                >
                  <Plus size={16} /> Request a centre
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="centre-toolbar">
                <Button onClick={register}>
                  {ownAtCentre
                    ? "Edit registration"
                    : own
                      ? "Switch to this centre"
                      : "Join this centre"}{" "}
                  <ArrowRight size={16} />
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      if (navigator.share)
                        await navigator.share({
                          title: centre?.name,
                          url: location.href,
                        });
                      else {
                        await navigator.clipboard.writeText(location.href);
                        setMessage("Centre link copied.");
                      }
                    } catch {}
                  }}
                >
                  <Share2 size={16} /> Share
                </Button>
                {centre && (
                  <Button asChild variant="outline">
                    <a
                      target="_blank"
                      rel="noreferrer"
                      href={
                        "https://www.google.com/maps/dir/?api=1&destination=" +
                        encodeURIComponent(centre.name + " " + centre.address)
                      }
                    >
                      <Navigation size={16} /> Directions
                    </a>
                  </Button>
                )}
              </div>
              {ownAtCentre && own && (
                <div className="own-card">
                  <div>
                    <b>Your exam-day plans</b>
                    <p>
                      {String(own.hostel)} ·{" "}
                      {own.visible
                        ? "Visible to approved students"
                        : "Private registration"}
                      {own.departure
                        ? " · Leaving " + String(own.departure).slice(0, 5)
                        : ""}
                    </p>
                  </div>
                  <Button variant="outline" onClick={returnReady}>
                    <Check size={16} />
                    {own.ready_until &&
                    new Date(String(own.ready_until)) > new Date()
                      ? "Cancel return status"
                      : "Ready to Return"}
                  </Button>
                  <button className="delete-link" onClick={remove}>
                    Delete registration
                  </button>
                </div>
              )}
              <div className="tabs">
                {["Everyone", "Going", "Returning"].map((t) => (
                  <button
                    className={tab === t ? "selected" : ""}
                    onClick={() => setTab(t)}
                    key={t}
                  >
                    {t}{" "}
                    {approved && (
                      <span>
                        {
                          mates.filter(
                            (m) =>
                              t === "Everyone" ||
                              (t === "Going"
                                ? m.going
                                : m.ready_until &&
                                  new Date(m.ready_until) > new Date()),
                          ).length
                        }
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="directory-note">
                <ShieldCheck size={15} /> Both hostels, one centre. Return
                status lasts 2 hours.
              </p>
              {!approved ? (
                <div className="empty">
                  <ShieldCheck size={32} />
                  <h3>Your community, with a little privacy.</h3>
                  <p>
                    Sign in with your approved Scaler email to see students at
                    this centre.
                  </p>
                  <Button onClick={login}>
                    Continue with Google <ArrowRight size={16} />
                  </Button>
                </div>
              ) : (
                <div className="mates-grid">
                  {mates
                    .filter(
                      (m) =>
                        tab === "Everyone" ||
                        (tab === "Going"
                          ? m.going
                          : m.ready_until &&
                            new Date(m.ready_until) > new Date()),
                    )
                    .map((m) => (
                      <div className="mate-card" key={m.id}>
                        <span className="avatar">
                          {m.name.slice(0, 1).toUpperCase()}
                        </span>
                        <div>
                          <h3>{m.name}</h3>
                          <p>
                            {m.hostel}
                            {m.departure ? " · " + m.departure.slice(0, 5) : ""}
                          </p>
                          <span className="status">
                            {m.ready_until
                              ? "Ready to return"
                              : m.going
                                ? "Open to sharing a ride"
                                : "At your centre"}
                          </span>
                        </div>
                        {m.has_contact && (
                          <button
                            aria-label={"Contact " + m.name + " on WhatsApp"}
                            onClick={() => contact(m.id)}
                          >
                            <MessageCircle size={22} />
                          </button>
                        )}
                      </div>
                    ))}
                  {!mates.filter(
                    (m) =>
                      tab === "Everyone" ||
                      (tab === "Going"
                        ? m.going
                        : m.ready_until &&
                          new Date(m.ready_until) > new Date()),
                  ).length && (
                    <div className="empty">
                      <Users size={30} />
                      <h3>
                        {tab === "Returning"
                          ? "No one is heading back just yet"
                          : "Be the first to say hello"}
                      </h3>
                      <p>
                        Students who choose to share their plans will appear
                        here.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
        {!centreId && (
          <section className="how" id="how-it-works">
            <div className="eyebrow">LESS PLANNING. MORE PEACE OF MIND.</div>
            <h2>Your exam day, sorted.</h2>
            <div className="steps">
              {[
                {
                  n: "01",
                  icon: MapPin,
                  title: "Find your centre",
                  copy: "Choose your upcoming exam and the centre on your hall ticket.",
                },
                {
                  n: "02",
                  icon: Users,
                  title: "Meet your people",
                  copy: "Add your plans. Find students from both hostels going your way.",
                },
                {
                  n: "03",
                  icon: Route,
                  title: "Go together. Get back together.",
                  copy: "Coordinate a ride, then mark yourself ready when it’s time to return.",
                },
              ].map((s) => (
                <div key={s.n}>
                  <span className="step-number">{s.n}</span>
                  <s.icon size={25} />
                  <h3>{s.title}</h3>
                  <p>{s.copy}</p>
                </div>
              ))}
            </div>
          </section>
        )}
        <div className="privacy-band">
          <ShieldCheck size={25} />
          <div>
            <b>Made for your community. Built around your privacy.</b>
            <p>
              Only approved students see the directory. Sharing your name and
              WhatsApp is always optional.
            </p>
          </div>
        </div>
      </main>
      <footer>
        <a className="brand" href="/">
          <Route size={21} />
          CentreMate
        </a>
        <span>A little company goes a long way.</span>
        <small>
          Independent student initiative · Not affiliated with IIT Madras or
          Scaler
        </small>
      </footer>
      {modal && (
        <dialog
          ref={dialogRef}
          className="modal-overlay"
          aria-label={
            modal === "register" ? "Your exam plans" : "Request a centre"
          }
          onCancel={() => setModal(null)}
          onClick={() => setModal(null)}
        >
          <section
            className="modal"
            aria-label={
              modal === "register" ? "Your exam plans" : "Request a centre"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setModal(null)}
              aria-label="Close"
            >
              <X size={21} />
            </button>
            <span className="map-icon">
              <MapPin size={24} />
            </span>
            <h2>
              {modal === "register"
                ? "Your exam-day plans"
                : "Put your centre on the map"}
            </h2>
            <p>
              {modal === "register"
                ? "A few details, and you’re good to go."
                : "Your coordinator will review the details before adding it."}
            </p>
            {modal === "register" ? (
              <form onSubmit={save}>
                <label>
                  Your name
                  <input
                    name="name"
                    required
                    maxLength={80}
                    defaultValue={String(
                      own?.name ?? user?.user_metadata.full_name ?? "",
                    )}
                  />
                </label>
                <label>
                  Exam centre
                  <select
                    name="centre_id"
                    required
                    defaultValue={String(centreId ?? own?.centre_id ?? "")}
                  >
                    <option value="" disabled>
                      Select your allotted centre
                    </option>
                    {centres.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="form-row">
                  <label>
                    Hostel
                    <select
                      name="hostel"
                      defaultValue={String(own?.hostel ?? "Uni 1")}
                    >
                      <option>Uni 1</option>
                      <option>Uni 2</option>
                    </select>
                  </label>
                  <label>
                    Departure time <small>IST · optional</small>
                    <input
                      name="departure"
                      type="time"
                      defaultValue={String(own?.departure ?? "")}
                    />
                  </label>
                </div>
                <label>
                  WhatsApp number <small>optional, with country code</small>
                  <input
                    name="whatsapp"
                    type="tel"
                    pattern="[+0-9 ()-]{8,24}"
                    placeholder="e.g. +91 98765 43210"
                    defaultValue={String(own?.whatsapp ?? "")}
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    name="going"
                    defaultChecked={Boolean(own?.going)}
                  />{" "}
                  I’m interested in sharing a ride
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    name="visible"
                    defaultChecked={Boolean(own?.visible)}
                  />{" "}
                  I agree to show my name, hostel and travel plans to approved
                  students. If I add WhatsApp, students registered at my centre
                  can contact me.
                </label>
                <p className="form-help">
                  Leave sharing unchecked to keep your registration private.
                  Both hostels always appear together.
                </p>
                <Button disabled={busy} type="submit">
                  {busy ? "Saving…" : "Save my plans"} <Check size={17} />
                </Button>
              </form>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  const f = new FormData(e.currentTarget);
                  const { error } = await db!.from("centre_requests").insert({
                    email: user!.email!.toLowerCase(),
                    name: f.get("name"),
                    address: f.get("address"),
                  });
                  setBusy(false);
                  setMessage(
                    error
                      ? error.message
                      : "Centre request sent. Your coordinator will review it.",
                  );
                  if (!error) setModal(null);
                }}
              >
                <label>
                  Centre name
                  <input name="name" required maxLength={160} />
                </label>
                <label>
                  Full address
                  <textarea name="address" required maxLength={500} />
                </label>
                <Button disabled={busy}>
                  Send request <ArrowRight size={16} />
                </Button>
              </form>
            )}
          </section>
        </dialog>
      )}
    </>
  );
}
