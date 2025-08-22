import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { GameScene } from './GameScene';

export function CanvasGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const parent = containerRef.current;
    const width = parent.clientWidth || window.innerWidth;
    const height = parent.clientHeight || window.innerHeight;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width,
      height,
      parent,
      transparent: true,
      scene: [GameScene],
      scale: { mode: Phaser.Scale.RESIZE },
      physics: { default: 'arcade' },
    });
    gameRef.current = game;

    const onResize = () => {
      const w = parent.clientWidth || window.innerWidth;
      const h = parent.clientHeight || window.innerHeight;
      game.scale.resize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(parent);

    return () => {
      ro.disconnect();
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div className="game-canvas-container" ref={containerRef} />;
}
