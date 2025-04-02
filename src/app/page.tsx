"use client";
import { useEffect, useState } from "react";

export default function LiffLoading() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const liffInit = async () => {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      const formBase = process.env.NEXT_PUBLIC_FORM_BASE;
      const uidKey = process.env.NEXT_PUBLIC_UID_KEY;
      if (!liffId || !formBase || !uidKey) {
        setError("環境変数が正しく設定されていません。");
        return;
      }
      try {
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }
        const profile = await liff.getProfile();
        const uid = profile.userId;
        // UIDをbase64エンコード
        const base64uid = btoa(uid);
        // GoogleフォームのURL組み立て
        const url = `${formBase}&${uidKey}=${encodeURIComponent(base64uid)}`;
        // alert(`liff.getProfile()のレスポンス:\n${JSON.stringify(profile, null, 2)}\n\nリダイレクト先URL:\n${url}`);
        window.location.replace(url);
      } catch (e: unknown) {
        const message = (typeof e === "object" && e && "message" in e) ? (e as { message: string }).message : String(e);
        setError("LIFF初期化またはUID取得に失敗しました: " + message);
      }
    };
    liffInit();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-white">
      {error ? (
        <div className="text-red-500 text-center p-4">
          <div className="mb-4 font-bold">エラーが発生しました</div>
          <div>{error}</div>
        </div>
      ) : (
        <>
          <div className="w-16 h-16 border-4 border-blue-400 border-t-transparent rounded-full animate-spin mb-6" />
          <div className="text-lg text-gray-700">Loading…</div>
        </>
      )}
    </div>
  );
}
