# Settlement studio: presentation-grade live graphics

This replaces the earlier plain status-card / bar-column presentation in PR #50. It does not change the observation network, signer, backend API or payment authorisation path.

## Visual direction

A dark, high-contrast live workspace with an amount-centred payment graphic, orbit/grid depth, a horizontal isometric block ribbon, lavender payment-block highlighting, a source-labelled evidence rail, large measurement tiles and a measured query trace. Mobile stacks the same components; the block ribbon remains horizontally inspectable with a minimum 44px target. Dense implementation explanations are behind Observation details rather than dominating the visual.

This is an original treatment informed by the user's preference for the morning presentation, not an exact recreation of an unavailable demo recording.

## Every data mark has a source

- The payment graphic receives the actual transaction amount, addresses and hash through the existing broadcast observer.
- Each isometric tile corresponds to a returned block. The same block retains its identity. Event counts are exact wallet-filtered counts; a zero stays zero. Tile height, orbit rings and background grid are decorative, not capacity, finality, geographic location or progress measurements.
- The highlighted tile contains this payment's event. A current positive transfer indicator still requires the existing exact-match validation.
- The payment's block is pinned after discovery/receipt; this is not an endlessly advancing fabricated stream of blocks. The archive-height metric is refreshed from the provider.
- The telemetry trace has one dot per received sample and uses actual time spacing. Lines interpolate geometry between measured points; they do not add samples or claim payment speed. Cached samples are not duplicated by the observer.
- No observations means no block tiles or telemetry data are inserted. Old data is visibly labelled as last received when the observer is unhealthy.

## Motion, without artificial transaction progress

Native React Native Animated is used; no chart/WebGL runtime or additional dependency is introduced. A short block entrance and scan sweep run once per new server snapshot. The snapshot-age clock never creates a block or data value. Motion stops on unavailable, partial, stale, paused or conflict states, and browser/native backgrounding already pauses the observer. OS reduced motion is respected; a separate Pause visual motion control leaves the data reads unaffected.

The static orbit rings are visual framing, not a progress percentage. Stage status comes only from the existing validated evidence.

Official APIs used:
- https://reactnative.dev/docs/animated
- https://reactnative.dev/docs/accessibilityinfo
- https://docs.envio.dev/docs/HyperSync/overview

## Validation and preview boundaries

`studio-geometry.test.ts` covers zero/one sample, missing/invalid values, cache duplicates, bounded ordering, correct time geometry and exact amount display.

The existing broadcast/evidence tests remain unchanged. The updated browser fixture test exercises the actual component, source-binding, state transitions, mobile tile selection, reduced motion, manual motion pause, no horizontal page overflow and no write requests. It captures desktop/mobile screenshots and a short animation recording. All provider responses in that test are explicitly fixtures, with a permanent NOT A LIVE PAYMENT banner. The test bundle is separate from apps/mobile/dist and must not be deployed.

## Unchanged live activation requirements

Live testing still needs Cherry Money #384 deployed with the migration, a saved/tested Envio token, permitted origin and feed enablement, plus the updated app. This visual change neither installs a token nor deploys the backend, submits a transaction or marks an accounting record paid.

HyperSync and HyperIndex share a data source. Source-labelled indicators are not independent consensus, and do not establish finality or accounting posting. CRE remains the separate business-verification workflow. All broader launch blockers in LAUNCH_READINESS_NOTES.md remain.
