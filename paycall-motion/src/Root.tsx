import { Composition } from 'remotion'
import { BUYERS_D, Buyers } from './Buyers'
import { SELLERS_D, Sellers } from './Sellers'
import { STEPS_D, Steps } from './Steps'
import { FPS } from './ui'

export const Root = () => (
  <>
    <Composition id="buyers" component={Buyers} durationInFrames={BUYERS_D} fps={FPS} width={1600} height={1000} />
    <Composition id="sellers" component={Sellers} durationInFrames={SELLERS_D} fps={FPS} width={1600} height={1000} />
    <Composition id="steps" component={Steps} durationInFrames={STEPS_D} fps={FPS} width={1600} height={600} />
  </>
)
