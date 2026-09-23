"use client";

import { motion, type HTMLMotionProps } from "framer-motion";

// 動畫參數沿用作品集專案（C:\Portfolio）的 work-card / experience-timeline

type RevealProps = HTMLMotionProps<"section"> & {
  /** 滑鼠移上時浮起（小卡片用；含輸入框的大表單不要開，會一直晃） */
  float?: boolean;
  /** 在清單中的順序，用來做依序淡入 */
  index?: number;
  /** false = 滑出畫面再滑回來會重新淡入（作品集卡片的行為） */
  once?: boolean;
};

/** 卡片：滑進畫面時由下往上淡入，可選擇滑鼠移上浮起 */
export function RevealCard({ float = false, index = 0, once = true, className, ...props }: RevealProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-40px" }}
      whileHover={float ? { y: -4 } : undefined}
      transition={{ duration: 0.35, ease: "easeOut", delay: Math.min(index, 8) * 0.06 }}
      className={`card ${float ? "lift" : ""} ${className ?? ""}`}
      {...props}
    />
  );
}

/** 清單項目：依序淡入 + 浮起 */
export function RevealItem({
  index = 0,
  float = true,
  className,
  ...props
}: HTMLMotionProps<"div"> & { index?: number; float?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: false, margin: "-30px" }}
      whileHover={float ? { y: -4 } : undefined}
      transition={{ duration: 0.3, delay: Math.min(index, 10) * 0.05 }}
      className={`${float ? "lift" : ""} ${className ?? ""}`}
      {...props}
    />
  );
}

/** 結果揭曉：彈出放大 */
export function Pop({ className, ...props }: HTMLMotionProps<"section">) {
  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", bounce: 0.45, duration: 0.6 }}
      className={className}
      {...props}
    />
  );
}
