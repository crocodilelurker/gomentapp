// A clock that only moves when told to, so timestamps and retry delays are deterministic.
function manualClock(startMs = Date.UTC(2026, 0, 1)) {
  let current = startMs;
  const now = () => new Date(current);
  now.advance = (ms) => {
    current += ms;
  };
  return now;
}

module.exports = { manualClock };
