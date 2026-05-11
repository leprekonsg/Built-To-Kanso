"use client";

import type { Material, Mesh, Object3D, Side } from "three";
import { Component, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { TokenPlacement, TokenPersonalityVariant } from "@/server/rules/tokens";
import styles from "./LiveStudio.module.css";

interface TokenVisualProofProps {
  placements: ReadonlyArray<TokenPlacement>;
  variant?: TokenPersonalityVariant;
}

interface TokenVisualResponse {
  visualOnly: true;
  tokenId: string;
  provider: string;
  modelUrl: string;
  disclaimer: string;
}

interface TokenVisualAsset extends TokenVisualResponse {
  key: string;
}

export function TokenVisualProof({ placements, variant = "japandi" }: TokenVisualProofProps) {
  return (
    <TokenVisualProofBoundary>
      <TokenVisualProofBody placements={placements} variant={variant} />
    </TokenVisualProofBoundary>
  );
}

interface TokenVisualProofBoundaryState {
  hasError: boolean;
}

class TokenVisualProofBoundary extends Component<{ children: ReactNode }, TokenVisualProofBoundaryState> {
  state: TokenVisualProofBoundaryState = { hasError: false };

  static getDerivedStateFromError(): TokenVisualProofBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return <TokenVisualFallback label="WebGL unavailable" />;
    return this.props.children;
  }
}

function TokenVisualFallback({ label }: { label: string }) {
  return (
    <aside className={styles.tokenProof} data-testid="token-visual-proof" aria-label="Visual-only token GLB proof">
      <div className={styles.tokenProofHead}>
        <span>Token GLB proof</span>
        <strong>unavailable</strong>
      </div>
      <div className={styles.tokenProofViewport}>
        <span className={styles.tokenProofStatus}>{label}</span>
      </div>
      <p>Visual-only GLB. Placement and airflow stay locked.</p>
    </aside>
  );
}

function TokenVisualProofBody({ placements, variant = "japandi" }: TokenVisualProofProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const visiblePlacements = useMemo(() => placements.slice(0, 6), [placements]);
  const [assets, setAssets] = useState<TokenVisualAsset[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "unavailable">(
    visiblePlacements.length ? "loading" : "idle",
  );

  useEffect(() => {
    if (visiblePlacements.length === 0) {
      setAssets([]);
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    setStatus("loading");

    async function loadAssets() {
      try {
        const loaded = await Promise.all(
          visiblePlacements.map(async (placement, index) => {
            const response = await fetch("/api/tokens/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tokenId: placement.tokenId, variant, provider: "auto" }),
              signal: controller.signal,
            });
            if (!response.ok) throw new Error("Token visual route returned a non-200 response.");
            const body = (await response.json()) as TokenVisualResponse;
            if (!body.visualOnly || !body.modelUrl) throw new Error("Token visual response was not visual-only.");
            return {
              ...body,
              key: `${placement.tokenId}-${placement.point.x.toFixed(2)}-${placement.point.y.toFixed(2)}-${index}`,
            };
          }),
        );
        if (!controller.signal.aborted) {
          setAssets(loaded);
          setStatus("ready");
        }
      } catch {
        if (!controller.signal.aborted) {
          setAssets([]);
          setStatus("unavailable");
        }
      }
    }

    void loadAssets();

    return () => controller.abort();
  }, [variant, visiblePlacements]);

  useEffect(() => {
    const host = viewportRef.current;
    if (!host || assets.length === 0) return undefined;

    let disposed = false;
    let animationId = 0;
    let resizeObserver: ResizeObserver | null = null;

    async function mountScene() {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      if (disposed || !host) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      host.replaceChildren(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
      camera.position.set(0, 1.35, 4.8);
      camera.lookAt(0, 0, 0);
      scene.add(new THREE.AmbientLight(0xf5f1e8, 1.25));
      const keyLight = new THREE.DirectionalLight(0xffe1a3, 1.4);
      keyLight.position.set(2.6, 3.4, 4.2);
      scene.add(keyLight);
      const grid = new THREE.GridHelper(4.2, 8, 0xa79f93, 0xc9c4ba);
      grid.position.y = -0.86;
      scene.add(grid);
      const axes = new THREE.AxesHelper(0.72);
      axes.position.set(-1.82, -0.84, 0);
      scene.add(axes);

      const loader = new GLTFLoader();
      const groups: InstanceType<typeof THREE.Group>[] = [];
      const columns = Math.min(3, assets.length);

      await Promise.all(
        assets.map(async (asset, index) => {
          const gltf = await loader.loadAsync(asset.modelUrl);
          if (disposed) return;
          const root = gltf.scene;
          prepareObjectMaterials(root, THREE.DoubleSide);
          normalizeObjectForProof(root, THREE);

          const group = new THREE.Group();
          group.name = `${asset.tokenId}-visual-proof`;
          group.userData.visualOnly = true;
          group.add(root);

          const col = index % columns;
          const row = Math.floor(index / columns);
          group.position.set((col - (columns - 1) / 2) * 1.18, row === 0 ? 0.26 : -0.58, 0);
          scene.add(group);
          const box = new THREE.BoxHelper(group, 0x111111);
          scene.add(box);
          groups.push(group);
        }),
      );

      function resize() {
        if (!host || disposed) return;
        const width = Math.max(240, host.clientWidth);
        const height = Math.max(120, host.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
      }

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      resize();

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reducedMotion) return;

      function animate() {
        groups.forEach((group, index) => {
          group.rotation.y += 0.006 + index * 0.001;
        });
        renderer.render(scene, camera);
        animationId = window.requestAnimationFrame(animate);
      }
      animate();

      return () => {
        window.cancelAnimationFrame(animationId);
        resizeObserver?.disconnect();
        disposeScene(scene);
        renderer.dispose();
        host.replaceChildren();
      };
    }

    let cleanup: (() => void) | undefined;
    void mountScene().then((fn) => {
      if (disposed) fn?.();
      else cleanup = fn;
    }).catch(() => {
      if (!disposed) setStatus("unavailable");
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [assets]);

  if (visiblePlacements.length === 0) return null;

  return (
    <aside className={styles.tokenProof} data-testid="token-visual-proof" aria-label="Visual-only token GLB proof">
      <div className={styles.tokenProofHead}>
        <span>Token GLB proof</span>
        <strong>{status === "ready" ? providerLabel(assets[0]?.provider) : status}</strong>
      </div>
      <div ref={viewportRef} className={styles.tokenProofViewport}>
        {status !== "ready" ? <span className={styles.tokenProofStatus}>{statusCopy(status)}</span> : null}
      </div>
      <p>Visual-only GLB. Placement and airflow stay locked.</p>
    </aside>
  );
}

function providerLabel(provider: string | undefined): string {
  if (provider === "local-demo") return "local visual";
  return provider ?? "local visual";
}

function statusCopy(status: "idle" | "loading" | "ready" | "unavailable"): string {
  if (status === "loading") return "Loading local GLB";
  if (status === "unavailable") return "GLB unavailable";
  return "Waiting";
}

function normalizeObjectForProof(loaded: Object3D, THREE: typeof import("three")) {
  const box = new THREE.Box3().setFromObject(loaded);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z) || 1;
  loaded.position.sub(center);
  loaded.scale.setScalar(0.82 / longest);
}

function prepareObjectMaterials(root: Object3D, side: Side) {
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    for (const material of materialList(mesh.material)) {
      material.side = side;
      material.needsUpdate = true;
    }
  });
}

function materialList(material: Material | Material[]): Material[] {
  return Array.isArray(material) ? material : [material];
}

function disposeScene(scene: Object3D) {
  scene.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    if (mesh.material) materialList(mesh.material).forEach((material) => material.dispose());
  });
}
