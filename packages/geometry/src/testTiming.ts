/**
 * How many times longer `run(large)` takes than `run(small)`: the speed tests hold how the time grows with
 * the mesh, never seconds. After a warm-up the two are timed in turn, so a busy machine slows both alike, and
 * the fastest of five rounds counts. A round repeats a quick run until it lasts 20 ms: below that the clock
 * and the scheduler, not the check, decide a ratio of milliseconds (a funnel at 5 mm takes under one).
 */
export function growth<T>(run: (input: T) => unknown, small: T, large: T): number {
  const time = (input: T, calls: number) => {
    const start = performance.now();
    for (let call = 0; call < calls; call += 1) run(input);
    return (performance.now() - start) / calls;
  };
  // Doubling the calls until a round lasts 20 ms is the warm-up too.
  const callsFor = (input: T) => {
    let calls = 1;
    while (time(input, calls) * calls < 20) calls *= 2;
    return calls;
  };
  const [smallCalls, largeCalls] = [callsFor(small), callsFor(large)];
  let [fastSmall, fastLarge] = [Infinity, Infinity];
  for (let round = 0; round < 5; round += 1) {
    fastSmall = Math.min(fastSmall, time(small, smallCalls));
    fastLarge = Math.min(fastLarge, time(large, largeCalls));
  }
  return fastLarge / fastSmall;
}
