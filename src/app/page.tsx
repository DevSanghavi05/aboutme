import { AnimatedCircle } from "@/components/AnimatedCircle";
import TargetCursor from "@/components/TargetCursor";
import "@/components/TargetCursor.css";
import { SmoothScroll } from "@/components/SmoothScroll";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#fdfdfd] text-zinc-900 selection:bg-zinc-200 selection:text-zinc-900">
      <SmoothScroll />
      <TargetCursor targetSelector=".cursor-target" spinDuration={3} />
      <AnimatedCircle />
    </main>
  );
}
