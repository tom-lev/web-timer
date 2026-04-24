let timers = {};

function startTimer(id, remaining) {
  if (timers[id]) clearInterval(timers[id].interval);

  timers[id] = {
    remaining,
    lastTick: Date.now(),
    interval: null,
    doneSignaled: false,
    overtime: 0,
  };

  timers[id].interval = setInterval(() => {
    const now     = Date.now();
    const elapsed = now - timers[id].lastTick;
    timers[id].lastTick = now;

    if (!timers[id].doneSignaled) {
      timers[id].remaining = Math.max(0, timers[id].remaining - elapsed);
      postMessage({ type: 'tick', id, remaining: timers[id].remaining });

      if (timers[id].remaining <= 0) {
        timers[id].doneSignaled = true;
        postMessage({ type: 'done', id });
      }
    } else {
      timers[id].overtime += elapsed;
      postMessage({ type: 'overtime', id, elapsed: timers[id].overtime });
    }
  }, 250);
}

function pauseTimer(id) {
  if (timers[id] && !timers[id].doneSignaled) {
    clearInterval(timers[id].interval);
    const remaining = timers[id].remaining;
    delete timers[id];
    postMessage({ type: 'paused', id, remaining });
  }
}

function stopTimer(id) {
  if (timers[id]) {
    clearInterval(timers[id].interval);
    delete timers[id];
  }
}

self.onmessage = ({ data }) => {
  switch (data.cmd) {
    case 'start': startTimer(data.id, data.remaining); break;
    case 'pause': pauseTimer(data.id); break;
    case 'stop':  stopTimer(data.id); break;
  }
};
