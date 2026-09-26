import "server-only";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// 只有主辦方需要登入（建立活動、管理自己的活動列表）；組員填寫志願完全不需要帳號，
// 這點刻意保留跟之前一樣——見 docs/plan-slots-and-accounts.md §二。
// JWT session（不建 sessions 資料表，跟專案「盡量少建表」的風格一致）。
export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/" },
  callbacks: {
    // Google 的 profile.sub 是這個帳號永久不變的識別碼（不是 email，避免帳號因為換 email
    // 而失聯，也避免把 email 這種個資直接存進 activities 表）。NextAuth 在沒有資料庫 adapter
    // 時，預設會把 account.providerAccountId 存進 token.sub，這裡明確寫出來，不依賴預設行為。
    jwt({ token, account }) {
      if (account) token.sub = account.providerAccountId;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSessionUser;
  }
}

// next-auth 的 DefaultSession["user"] 型別是 optional 欄位的 name/email/image；
// 這裡重新宣告一份避免額外 import 產生循環型別依賴。
interface DefaultSessionUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}
