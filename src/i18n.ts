// Lightweight, type-safe message catalog (single English locale for now).
// Structured to migrate 1:1 to next-intl message JSON when a Chinese UI is added.

export const messages = {
  app: { name: "HSK Online" },
  nav: {
    signIn: "Sign in",
    dashboard: "Dashboard",
    signOut: "Sign out",
  },
  home: {
    badge: "New HSK 3.0 · Levels 1–9",
    titleLead: "Learn Chinese and ace the",
    titleHighlight: "HSK exam",
    subtitle:
      "Vocabulary, listening, reading, writing, AI mock tests, and live 1-on-1 and group classes with teachers — all in one place.",
    getStarted: "Get started",
    goToDashboard: "Go to dashboard",
    exploreLevels: "Explore levels",
    features: {
      vocab: {
        title: "Vocabulary",
        body: "Official HSK 3.0 word lists with pinyin and audio.",
      },
      practice: {
        title: "Practice & mock tests",
        body: "New-format listening, reading, and writing.",
      },
      live: {
        title: "Live classes",
        body: "1-on-1 and group lessons with real teachers.",
      },
    },
  },
  auth: {
    welcomeBack: "Welcome back",
    createAccount: "Create your account",
    signInSubtitle: "Sign in to keep learning Chinese.",
    signUpSubtitle: "Start learning Chinese for the HSK exam.",
    name: "Name",
    email: "Email",
    password: "Password",
    signInBtn: "Sign in",
    createAccountBtn: "Create account",
    pleaseWait: "Please wait…",
    newHere: "New here?",
    haveAccount: "Already have an account?",
    toSignUp: "Create an account",
    toSignIn: "Sign in",
    signUpFailed: "Sign up failed",
    signInFailed: "Sign in failed",
    genericError: "Something went wrong. Please try again.",
  },
  dashboard: {
    welcome: "Welcome",
    placeholder: "You are signed in. This is a placeholder dashboard for Phase 0.",
    emailLabel: "Email",
    roleLabel: "Role",
  },
} as const;

export const t = messages;
