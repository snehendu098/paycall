import { Config } from '@remotion/cli/config'

// bundled chrome may crash on some macs (icudtl); CHROME=/path/to/chrome-headless-shell overrides
if (process.env.CHROME) Config.setBrowserExecutable(process.env.CHROME)
Config.setChromiumOpenGlRenderer('angle')
