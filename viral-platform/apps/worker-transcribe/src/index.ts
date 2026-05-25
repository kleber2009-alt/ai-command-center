import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transcribeAudio } from '@vp/ai';
import { db, logJobFinish, logJobStart, setProjectStatus, transcripts } from '@vp/db';
import { extractAudioWav } from '@vp/ffmpeg';
import { QUEUE, createWorker, enqueue, publishProgress } from '@vp/queue';
import { getObjectBuffer, putJson } from '@vp/storage';

/**
 * worker-transcribe (§5.2): pull video from R2 → extract 16kHz mono WAV →
 * Deepgram → persist transcript JSON to R2 + summary row → enqueue detect.
 * Idempotent: re-running overwrites the same transcript R2 key.
 */
createWorker(QUEUE.transcribe, async (job) => {
  const { projectId, sourceVideoR2Key } = job.data;
  const logId = await logJobStart(job.id ?? '', projectId, QUEUE.transcribe);

  try {
    await setProjectStatus(projectId, 'transcribing');
    await publishProgress({
      projectId,
      status: 'transcribing',
      pct: 5,
      message: 'Downloading video',
    });

    const dir = await mkdtemp(join(tmpdir(), 'vp-transcribe-'));
    const videoPath = join(dir, 'source');
    const wavPath = join(dir, 'audio.wav');
    try {
      await writeFile(videoPath, await getObjectBuffer(sourceVideoR2Key));
      await publishProgress({
        projectId,
        status: 'transcribing',
        pct: 30,
        message: 'Extracting audio',
      });
      await extractAudioWav(videoPath, wavPath);

      await publishProgress({
        projectId,
        status: 'transcribing',
        pct: 55,
        message: 'Transcribing',
      });
      const transcript = await transcribeAudio(await readFile(wavPath));

      const transcriptKey = `transcripts/${projectId}.json`;
      await putJson(transcriptKey, transcript);
      await db.insert(transcripts).values({
        projectId,
        fullJsonR2Key: transcriptKey,
        language: transcript.language,
        speakersCount: transcript.speakersCount,
        summary: transcript.words
          .slice(0, 60)
          .map((w) => w.word)
          .join(' '),
      });

      await publishProgress({
        projectId,
        status: 'transcribing',
        pct: 100,
        message: 'Transcribed',
      });
      await enqueue(QUEUE.detect, { projectId, userId: job.data.userId }, `detect:${projectId}`);
      await logJobFinish(logId, 'done');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  } catch (err) {
    await logJobFinish(logId, 'failed', String(err));
    throw err; // let BullMQ retry (3x, exponential); failProject handled on final fail
  }
});

console.log('[worker-transcribe] ready');
