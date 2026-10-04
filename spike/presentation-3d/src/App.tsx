import type { JSX } from 'react';
import { PresentationRoot } from './components/PresentationRoot';
import { demoSceneProjection } from './data/scene-projection';

export function App(): JSX.Element {
  return <PresentationRoot projection={demoSceneProjection} />;
}
