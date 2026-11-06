package org.streamy.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.pm.PackageManager;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.SystemClock;
import android.util.Log;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AlertDialog;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;

final class VoiceSearchController {
    private static final String TAG = "VoiceSearch";
    private static final String MODEL = "vosk-model-small-en-us-0.15";
    private static final int SAMPLE_RATE = 16000;
    private static final long LISTEN_MS = 7000L;

    private final MainActivity activity;
    private final Consumer<String> deliverQuery;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ActivityResultLauncher<String> permissionRequest;
    private AlertDialog dialog;
    private boolean permissionPending;
    private volatile int session;
    private boolean recordingRequested;

    VoiceSearchController(MainActivity activity, Consumer<String> deliverQuery) {
        this.activity = activity;
        this.deliverQuery = deliverQuery;
        permissionRequest = activity.registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
            permissionPending = false;
            if (dialog == null) return;
            if (granted || activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) startListening();
            else showMessage("Allow microphone access to use voice search.");
        });
    }

    void show() {
        show(false);
    }

    void show(boolean listenImmediately) {
        if (dialog != null || activity.isFinishing() || !activity.hasWindowFocus()) return;
        dialog = new AlertDialog.Builder(activity)
            .setTitle("Voice search")
            .setMessage("Choose Listen, then say a movie, show, or actor name in English.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Listen", null)
            .create();
        dialog.setOnDismissListener(ignored -> {
            session++;
            dialog = null;
            recordingRequested = false;
        });
        dialog.show();
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> requestListening());
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).requestFocus();
        if (listenImmediately) requestListening();
    }

    private void requestListening() {
            if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                startListening();
            } else if (!permissionPending) {
                permissionPending = true;
                permissionRequest.launch(Manifest.permission.RECORD_AUDIO);
            }
    }

    private void startListening() {
        if (recordingRequested) return;
        recordingRequested = true;
        int request = ++session;
        showMessage("Getting the microphone ready…");
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
        dialog.getButton(AlertDialog.BUTTON_NEGATIVE).requestFocus();
        worker.execute(() -> recognize(request));
    }

    private void showMessage(String text) {
        if (dialog != null) dialog.setMessage(text);
    }

    private void recognize(int request) {
        try {
            File modelDir = prepareModel();
            if (request != session) return;
            try (Model model = new Model(modelDir.getAbsolutePath());
                 Recognizer recognizer = new Recognizer(model, SAMPLE_RATE)) {
                if (request != session) return;
                String query = listen(recognizer, request);
                activity.runOnUiThread(() -> {
                    if (request != session || dialog == null || !dialog.isShowing()) return;
                    if (query.isEmpty()) {
                        retry("I couldn’t recognize a title. Check the microphone and try again.");
                    } else {
                        dialog.dismiss();
                        deliverQuery.accept(query);
                    }
                });
            }
        } catch (NoMicrophoneAudioException error) {
            activity.runOnUiThread(() -> {
                if (request == session && dialog != null && dialog.isShowing()) {
                    retry("No microphone audio reached Tellyvo. Check that the Cube’s microphone is on and try again.");
                }
            });
        } catch (Exception | LinkageError error) {
            Log.w(TAG, "Could not run voice search", error);
            activity.runOnUiThread(() -> {
                if (request == session && dialog != null) retry("Voice search couldn’t start. Check microphone access and try again.");
            });
        }
    }

    private void retry(String message) {
        recordingRequested = false;
        showMessage(message);
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).requestFocus();
    }

    @SuppressLint("MissingPermission")
    private String listen(Recognizer recognizer, int request) throws Exception {
        int minimum = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (minimum <= 0) throw new IOException("Audio input format unavailable");
        AudioRecord audio = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(minimum, 6400));
        try {
            if (audio.getState() != AudioRecord.STATE_INITIALIZED) throw new IOException("Microphone unavailable");
            if (request != session) return "";
            AudioManager manager = activity.getSystemService(AudioManager.class);
            if (manager != null && activity.getPackageManager().hasSystemFeature("amazon.hardware.fire_tv")) {
                for (AudioDeviceInfo device : manager.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
                    if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_MIC) {
                        Log.i(TAG, "Built-in microphone route requested: " + audio.setPreferredDevice(device));
                        break;
                    }
                }
            }
            audio.startRecording();
            if (audio.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) throw new IOException("Microphone did not start");
            activity.runOnUiThread(() -> {
                if (request == session) showMessage("Listening… Say a title or actor name.");
            });
            short[] buffer = new short[1600];
            long deadline = SystemClock.elapsedRealtime() + LISTEN_MS;
            boolean audioPresent = false;
            try {
                while (request == session && SystemClock.elapsedRealtime() < deadline) {
                    int count = audio.read(buffer, 0, buffer.length, AudioRecord.READ_NON_BLOCKING);
                    if (count < 0) throw new IOException("Audio read failed: " + count);
                    if (count == 0) {
                        Thread.sleep(20);
                        continue;
                    }
                    if (!audioPresent) {
                        for (int i = 0; i < count; i++) {
                            if (Math.abs((int) buffer[i]) > 100) {
                                audioPresent = true;
                                break;
                            }
                        }
                    }
                    if (recognizer.acceptWaveForm(buffer, count)) {
                        String text = readText(recognizer.getResult());
                        if (!text.isEmpty()) return text;
                    }
                }
                if (request != session) return "";
                if (!audioPresent) throw new NoMicrophoneAudioException();
                return readText(recognizer.getFinalResult());
            } finally {
                AudioDeviceInfo device = audio.getRoutedDevice();
                Log.i(TAG, "Capture finished; audible input=" + audioPresent + ", input type=" + (device == null ? "unknown" : device.getType()));
            }
        } finally {
            if (audio.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) audio.stop();
            audio.release();
        }
    }

    private static final class NoMicrophoneAudioException extends IOException {}

    private static String readText(String result) throws Exception {
        return new JSONObject(result).optString("text").trim();
    }

    private File prepareModel() throws IOException {
        File cache = new File(activity.getFilesDir(), "voice-models");
        File modelDir = new File(cache, MODEL);
        File complete = new File(modelDir, ".ready");
        if (complete.isFile()) return modelDir;
        String modelRoot = modelDir.getCanonicalPath() + File.separator;
        try (ZipInputStream archive = new ZipInputStream(activity.getAssets().open("voice/" + MODEL + ".zip"))) {
            ZipEntry entry;
            byte[] buffer = new byte[16384];
            while ((entry = archive.getNextEntry()) != null) {
                if (entry.isDirectory()) continue;
                File output = new File(cache, entry.getName());
                if (!output.getCanonicalPath().startsWith(modelRoot)) throw new IOException("Invalid voice model path");
                File parent = output.getParentFile();
                if (!parent.isDirectory() && !parent.mkdirs()) throw new IOException("Could not prepare voice model directory");
                try (FileOutputStream file = new FileOutputStream(output)) {
                    int count;
                    while ((count = archive.read(buffer)) != -1) file.write(buffer, 0, count);
                }
            }
        }
        if (!new File(modelDir, "am/final.mdl").isFile() || !complete.createNewFile()) throw new IOException("Voice model incomplete");
        return modelDir;
    }

    void pause() {
        if (!permissionPending && dialog != null) dialog.dismiss();
    }

    void close() {
        if (dialog != null) dialog.dismiss();
        worker.shutdownNow();
    }
}
