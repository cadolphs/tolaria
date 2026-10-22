"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

function TooltipProvider({
	delayDuration = 0,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
	return (
		<TooltipPrimitive.Provider
			data-slot="tooltip-provider"
			delayDuration={delayDuration}
			{...props}
		/>
	);
}

function Tooltip({
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
	return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
	return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function getRootZoom(): number {
	const style = getComputedStyle(document.documentElement);
	const overlayZoom = parseZoomValue(
		style.getPropertyValue("--tolaria-overlay-zoom-factor").trim(),
	);
	if (overlayZoom !== null) return overlayZoom;
	return (
		parseZoomValue(style.getPropertyValue("zoom")) ??
		parseZoomValue(document.documentElement.style.getPropertyValue("zoom")) ??
		1
	);
}

function parseZoomValue(source: string | undefined): number | null {
	if (!source || source === "normal") return null;
	const parsed = Number.parseFloat(source);
	const value = source.endsWith("%") ? parsed / 100 : parsed;
	return Number.isFinite(value) && value > 0 ? value : null;
}

const TooltipContent = React.forwardRef<
	React.ElementRef<typeof TooltipPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent(
	{
		className,
		sideOffset = 0,
		collisionPadding = 8,
		children,
		style,
		...props
	},
	forwardedRef,
) {
	const contentRef = React.useRef<HTMLDivElement>(null);

	React.useLayoutEffect(() => {
		const content = contentRef.current;
		if (!content) return;

		const zoom = getRootZoom();
		if (zoom === 1) return;

		// Radix positions the tooltip in zoomed coordinate space (because documentElement
		// has zoom applied). Adjust the position to logical viewport coordinates.
		const currentLeft = Number.parseFloat(content.style.left || "0");
		const currentTop = Number.parseFloat(content.style.top || "0");

		content.style.left = `${currentLeft / zoom}px`;
		content.style.top = `${currentTop / zoom}px`;
	});

	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Content
				ref={(node) => {
					contentRef.current = node;
					if (typeof forwardedRef === "function") {
						forwardedRef(node);
					} else if (forwardedRef) {
						forwardedRef.current = node;
					}
				}}
				data-slot="tooltip-content"
				sideOffset={sideOffset}
				collisionPadding={collisionPadding}
				className="z-50 origin-(--radix-tooltip-content-transform-origin)"
				// Radix positions both the content and arrow in viewport pixels. Keep
				// that coordinate space unzoomed; scale only the visual body below.
				style={{ zoom: 1 }}
				{...props}
			>
				<div
					className={cn(
						"bg-foreground text-background w-fit max-w-[min(calc(var(--radix-tooltip-content-available-width,22rem)/var(--tolaria-overlay-zoom-factor,1)),22rem)] rounded-md px-3 py-1.5 text-xs text-balance",
						className,
					)}
					style={{ zoom: "var(--tolaria-overlay-zoom-factor, 1)", ...style }}
				>
					{children}
				</div>
				<TooltipPrimitive.Arrow
					className="bg-foreground fill-foreground z-50 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]"
					style={{
						width: "calc(0.625rem * var(--tolaria-overlay-zoom-factor, 1))",
						height: "calc(0.625rem * var(--tolaria-overlay-zoom-factor, 1))",
					}}
				/>
			</TooltipPrimitive.Content>
		</TooltipPrimitive.Portal>
	);
});

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
