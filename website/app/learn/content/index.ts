import type { ComponentType } from 'react';
import SoundAndSampling from './sound-and-sampling';
import Nyquist from './nyquist';
import FftAndWindowing from './fft-and-windowing';
import Harmonics from './harmonics';
import PeakDetection from './peak-detection';
import FeatureExtraction from './feature-extraction';
import BuildingARecognizer from './building-a-recognizer';
import DtmfHistory from './dtmf-history';
import FftVsGoertzel from './fft-vs-goertzel';

/** slug → chapter body. Every slug in the ARTICLES registry must appear
 * here; the article route renders the component under the shared header. */
export const CONTENT: Record<string, ComponentType> = {
  'sound-and-sampling': SoundAndSampling,
  nyquist: Nyquist,
  'fft-and-windowing': FftAndWindowing,
  harmonics: Harmonics,
  'peak-detection': PeakDetection,
  'feature-extraction': FeatureExtraction,
  'building-a-recognizer': BuildingARecognizer,
  'dtmf-history': DtmfHistory,
  'fft-vs-goertzel': FftVsGoertzel,
};
