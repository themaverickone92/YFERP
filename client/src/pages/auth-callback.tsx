import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";

export default function AuthCallback() {
  const [, navigate] = useLocation();
  const { setTokenAndUser } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const error = params.get("error");

    if (error) {
      navigate(`/?error=${encodeURIComponent(error)}`);
      return;
    }

    if (token) {
      setTokenAndUser(token).then(() => {
        navigate("/dashboard");
      });
    } else {
      navigate("/");
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}
