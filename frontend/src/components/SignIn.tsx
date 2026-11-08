import { useState, type FormEvent } from "react";
import { LogIn } from "lucide-react";
import { AegisLogo } from "./AegisLogo";
import { getAccounts, signIn } from "@/data/api";
import { ROLE_LABEL } from "@/lib/roles";
import { useStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Refusal } from "./status";

/** Mock sign-in. The role is read from the stored profile, so there is nothing to choose here. */
export function SignIn() {
  const { dispatch } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const accounts = getAccounts();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your work email and password.");
      return;
    }
    const account = signIn(email, password);
    if (!account) {
      setError("No account uses this email. Use one of the demo accounts below.");
      return;
    }
    dispatch({ type: "signIn", account });
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4 py-12">
      <div className="w-full max-w-[400px]">
        <AegisLogo className="h-7 w-auto text-foreground" />
        <h1 className="page-title mt-8">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Motor claims triage. Your access follows the role on your profile.
        </p>

        <form onSubmit={submit} className="card-panel mt-6 space-y-4 p-6" noValidate>
          <div>
            <Label htmlFor="signin-email">Work email</Label>
            <Input
              id="signin-email"
              type="email"
              autoComplete="username"
              className="mt-2"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
            />
          </div>
          <div>
            <Label htmlFor="signin-password">Password</Label>
            <Input
              id="signin-password"
              type="password"
              autoComplete="current-password"
              className="mt-2"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
            />
          </div>
          {error && <Refusal>{error}</Refusal>}
          <Button type="submit" className="w-full">
            <LogIn aria-hidden /> Sign in
          </Button>
        </form>

        <section aria-labelledby="demo-accounts" className="mt-6">
          <h2 id="demo-accounts" className="text-xs font-medium text-text-2">
            Demo accounts
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Fills in the email and a demo password. Any password works in this prototype.
          </p>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-background">
            {accounts.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword("demo");
                    setError(null);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{a.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{a.email}</span>
                  </span>
                  <span className="shrink-0 text-xs text-text-2">{ROLE_LABEL[a.role]}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
