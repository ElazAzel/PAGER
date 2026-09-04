"use client";

import { useEffect, useRef, type HTMLAttributes } from "react";
import { appearanceAttributes, appearanceVariables, shouldAnimateAppearance, type PageAppearance } from "@/lib/appearance";

type Props = HTMLAttributes<HTMLDivElement> & {
  appearance?: Partial<PageAppearance> | null;
  accent?: string;
  replayKey?: number | string;
};

/** Content is visible in SSR and without observers. Motion is an enhancement,
 * never a prerequisite for reading a teaser, following a link or purchasing. */
export function AppearanceSurface({ appearance, accent, replayKey = 0, className = "", style, children, ...props }: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const attributes = appearanceAttributes(appearance);
  const signature = JSON.stringify(attributes);

  useEffect(() => {
    const root = surface.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let seen = new WeakSet<HTMLElement>();
    const motionAllowed = () => shouldAnimateAppearance(document.body.dataset.platformMotion, reduced.matches);
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const element = entry.target as HTMLElement;
        if (motionAllowed() && !element.contains(document.activeElement)) element.dataset.reveal = "true";
        observer.unobserve(element);
      }
    }, { threshold: 0.06 });
    const blocks = () => root.querySelectorAll<HTMLElement>(".appearance-block[data-entrance]");
    const scan = () => {
      if (!motionAllowed()) return;
      for (const element of blocks()) {
        if (element.closest(".appearance-surface") !== root || seen.has(element) || element.dataset.entrance === "none") continue;
        seen.add(element); observer.observe(element);
      }
    };
    const restart = () => {
      observer.disconnect(); seen = new WeakSet();
      for (const element of blocks()) delete element.dataset.reveal;
      scan();
    };
    const additions = new MutationObserver(records => {
      for (const change of records) if (change.type === "attributes") {
        const element = change.target as HTMLElement;
        seen.delete(element); delete element.dataset.reveal;
      }
      scan();
    });
    additions.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-entrance"] });
    const preference = new MutationObserver(restart);
    preference.observe(document.body, { attributes: true, attributeFilter: ["data-platform-motion"] });
    reduced.addEventListener("change", restart);
    restart();
    return () => {
      observer.disconnect(); additions.disconnect(); preference.disconnect();
      reduced.removeEventListener("change", restart);
      for (const element of blocks()) delete element.dataset.reveal;
    };
  }, [signature, replayKey]);

  return <div {...props} {...attributes} ref={surface} className={`appearance-surface ${className}`} style={{ ...style, ...appearanceVariables(appearance, accent) }}>{children}</div>;
}
