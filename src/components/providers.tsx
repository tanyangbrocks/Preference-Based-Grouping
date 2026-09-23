"use client";

import { MotionConfig } from "framer-motion";
import { ReactLenis } from "lenis/react";
import { OverscrollBounce } from "./overscroll-bounce";

// 平滑捲動（Lenis）+ 邊緣彈動，同作品集專案的根佈局。
// reducedMotion="user"：系統開啟「減少動態效果」時，framer-motion 動畫改為直接到位。
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ReactLenis root>
        <OverscrollBounce>{children}</OverscrollBounce>
      </ReactLenis>
    </MotionConfig>
  );
}
