import Phaser from 'phaser';
import { useGameStore } from '../state/store';

export class GameScene extends Phaser.Scene {
  create() {
    // Reserved for future particles/overlays. Map is rendered by MapLibre.
  }

  update(_time: number, delta: number) {
    useGameStore.getState().actions.tick(delta);
  }
}
