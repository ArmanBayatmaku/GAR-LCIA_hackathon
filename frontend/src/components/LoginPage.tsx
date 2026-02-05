import { useState } from "react";
import { motion } from "motion/react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { api, ApiError } from "../lib/api";
import { enableGuestMode, saveSession } from "../lib/auth";

interface LoginPageProps {
  onSuccess: () => void;
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [isLogin, setIsLogin] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        const res = await api.login(loginEmail.trim(), loginPassword);
        saveSession({
          accessToken: res.session.access_token,
          refreshToken: res.session.refresh_token,
        });
        onSuccess();
      } else {
        const res = await api.signup(registerEmail.trim(), registerPassword);
        saveSession({
          accessToken: res.session.access_token,
          refreshToken: res.session.refresh_token,
        });
        onSuccess();
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something failed. Check backend logs / network tab.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-800 overflow-hidden">
      <div className="relative w-full max-w-4xl h-[600px] mx-6">
        <div className="relative w-full h-full bg-white rounded-2xl shadow-2xl overflow-hidden flex">
          {/* Sliding Panel */}
          <motion.div
            className="absolute top-0 h-full w-[38%] bg-gradient-to-br from-gray-700 to-gray-800 z-10 flex flex-col items-center justify-center text-white p-8 border-r-2 border-red-600"
            animate={{
              left: isLogin ? "auto" : "0%",
              right: isLogin ? "0%" : "auto",
            }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
          >
            <div className="text-center">
              {isLogin ? (
                <motion.div
                  key="register-panel"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.4 }}
                >
                  <h2 className="mb-4 text-white">Nice to meet you!</h2>
                  <p className="mb-8 text-gray-300">
                    Enter your details and start your journey with us
                  </p>
                  <Button
                    onClick={() => !loading && setIsLogin(false)}
                    variant="outline"
                    size="lg"
                    className="bg-transparent text-white border-2 border-red-600 hover:bg-red-600 hover:text-white"
                    disabled={loading}
                  >
                    Register
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="login-panel"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.4 }}
                >
                  <h2 className="mb-4 text-white">Welcome Back!</h2>
                  <p className="mb-8 text-gray-300">
                    To keep connected with us please login with your info
                  </p>
                  <Button
                    onClick={() => !loading && setIsLogin(true)}
                    variant="outline"
                    size="lg"
                    className="bg-transparent text-white border-2 border-red-600 hover:bg-red-600 hover:text-white"
                    disabled={loading}
                  >
                    Login
                  </Button>
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Login Form - Left Side */}
          <motion.div
            className="absolute top-0 left-0 h-full w-[62%] flex items-center justify-center p-12"
            animate={{
              opacity: isLogin ? 1 : 0,
              x: isLogin ? 0 : -30,
              pointerEvents: isLogin ? "auto" : "none",
            }}
            transition={{
              duration: 0.6,
              ease: "easeInOut",
              delay: isLogin ? 0.3 : 0,
            }}
          >
            <div className="w-full max-w-sm">
              <motion.h2
                className="mb-8 text-center"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: isLogin ? 1 : 0, y: isLogin ? 0 : -10 }}
                transition={{ duration: 0.5, delay: isLogin ? 0.4 : 0 }}
              >
                Login to Account
              </motion.h2>

              {error && isLogin && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: isLogin ? 1 : 0, x: isLogin ? 0 : -20 }}
                  transition={{ duration: 0.5, delay: isLogin ? 0.5 : 0 }}
                >
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="you@example.com"
                    className="mt-1.5"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required={isLogin}
                    disabled={loading}
                  />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: isLogin ? 1 : 0, x: isLogin ? 0 : -20 }}
                  transition={{ duration: 0.5, delay: isLogin ? 0.6 : 0 }}
                >
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    className="mt-1.5"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required={isLogin}
                    disabled={loading}
                  />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: isLogin ? 1 : 0, y: isLogin ? 0 : 10 }}
                  transition={{ duration: 0.5, delay: isLogin ? 0.7 : 0 }}
                >
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
                    disabled={loading}
                  >
                    {loading ? "Logging in..." : "Login"}
                  </Button>
                </motion.div>
              </form>
            </div>
          </motion.div>

          {/* Register Form - Right Side */}
          <motion.div
            className="absolute top-0 right-0 h-full w-[62%] flex items-center justify-center p-12"
            animate={{
              opacity: !isLogin ? 1 : 0,
              x: !isLogin ? 0 : 30,
              pointerEvents: !isLogin ? "auto" : "none",
            }}
            transition={{ duration: 0.6, ease: "easeInOut", delay: !isLogin ? 0.3 : 0 }}
          >
            <div className="w-full max-w-sm">
              <motion.h2
                className="mb-8 text-center"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: !isLogin ? 1 : 0, y: !isLogin ? 0 : -10 }}
                transition={{ duration: 0.5, delay: !isLogin ? 0.4 : 0 }}
              >
                Create Account
              </motion.h2>

              {error && !isLogin && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: !isLogin ? 1 : 0, x: !isLogin ? 0 : 20 }}
                  transition={{ duration: 0.5, delay: !isLogin ? 0.5 : 0 }}
                >
                  <Label htmlFor="register-email">Email</Label>
                  <Input
                    id="register-email"
                    type="email"
                    placeholder="you@example.com"
                    className="mt-1.5"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    required={!isLogin}
                    disabled={loading}
                  />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: !isLogin ? 1 : 0, x: !isLogin ? 0 : 20 }}
                  transition={{ duration: 0.5, delay: !isLogin ? 0.6 : 0 }}
                >
                  <Label htmlFor="register-password">Password</Label>
                  <Input
                    id="register-password"
                    type="password"
                    placeholder="••••••••"
                    className="mt-1.5"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    required={!isLogin}
                    disabled={loading}
                  />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: !isLogin ? 1 : 0, y: !isLogin ? 0 : 10 }}
                  transition={{ duration: 0.5, delay: !isLogin ? 0.8 : 0 }}
                >
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
                    disabled={loading}
                  >
                    {loading ? "Registering..." : "Register"}
                  </Button>
                </motion.div>
              </form>

            </div>
          </motion.div>
        </div>
      </div>

      {/* Guest Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="mt-6"
      >
        <Button
          onClick={() => {
            enableGuestMode();
            onSuccess();
          }}
          variant="ghost"
          className="text-gray-300 hover:text-white"
          disabled={loading}
        >
          Continue as a guest
        </Button>
      </motion.div>
    </div>
  );
}
