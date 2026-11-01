/* ===== Camera Recorder ===== */
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        var video = Tools.$('live-video');
        var videoWrap = Tools.$('video-wrap');
        var videoPlaceholder = Tools.$('video-placeholder');
        var playbackWrap = Tools.$('playback-wrap');
        var playbackPlaceholder = Tools.$('playback-placeholder');
        var cameraSelect = Tools.$('camera-select');
        var btnStart = Tools.$('btn-start');
        var btnStopCam = Tools.$('btn-stop-cam');
        var btnSwitch = Tools.$('btn-switch');
        var btnRecord = Tools.$('btn-record');
        var btnStopRecord = Tools.$('btn-stop-record');
        var btnDownload = Tools.$('btn-download');
        var recIndicator = Tools.$('rec-indicator');
        var durationText = Tools.$('duration-text');
        var statusDot = Tools.$('status-dot');
        var statusText = Tools.$('status-text');
        var recordingInfo = Tools.$('recording-info');

        var stream = null;
        var mediaRecorder = null;
        var chunks = [];
        var recordedBlob = null;
        var recordedUrl = null;
        var durationTimer = null;
        var recordStartTime = 0;
        var facingMode = 'user';
        var devices = [];
        var lastRecordingDuration = '';

        function showMsg(type, text) { Tools.showBanner('banner', type, text); }
        function clearMsg() { Tools.clearBanner('banner'); }

        function setStatus(state, text) {
            statusDot.className = 'status-dot';
            if (state) statusDot.classList.add(state);
            statusText.textContent = text;
        }

        function fmtTime(ms) {
            var totalSec = Math.floor(ms / 1000);
            var m = Math.floor(totalSec / 60);
            var s = totalSec % 60;
            return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
        }

        function startDurationTimer() {
            recordStartTime = Date.now();
            durationText.style.display = '';
            durationText.textContent = '00:00';
            durationTimer = setInterval(function () {
                durationText.textContent = fmtTime(Date.now() - recordStartTime);
            }, 250);
        }

        function stopDurationTimer() {
            if (durationTimer) {
                clearInterval(durationTimer);
                durationTimer = null;
            }
            if (recordStartTime) {
                durationText.textContent = fmtTime(Date.now() - recordStartTime);
            }
        }

        function resetDuration() {
            if (durationTimer) { clearInterval(durationTimer); durationTimer = null; }
            recordStartTime = 0;
            durationText.style.display = 'none';
            durationText.textContent = '00:00';
        }

        // 列举摄像头设备并填充下拉
        function populateDevices() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return Promise.resolve();
            return navigator.mediaDevices.enumerateDevices().then(function (list) {
                devices = list.filter(function (d) { return d.kind === 'videoinput'; });
                cameraSelect.innerHTML = '';
                if (devices.length === 0) {
                    var opt = Tools.el('option', { value: '', text: '未检测到摄像头设备' });
                    cameraSelect.appendChild(opt);
                    return;
                }
                devices.forEach(function (d, i) {
                    var label = d.label || ('摄像头 ' + (i + 1));
                    var opt = Tools.el('option', { value: d.deviceId, text: label });
                    cameraSelect.appendChild(opt);
                });
                cameraSelect.disabled = false;
                btnSwitch.disabled = devices.length < 1;
            });
        }

        // 启动摄像头流
        function startStream(deviceId, facing) {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                showMsg('error', '当前浏览器不支持摄像头访问 (getUserMedia)');
                return Promise.reject(new Error('not supported'));
            }
            var constraints = { audio: true, video: true };
            if (deviceId) {
                constraints.video = { deviceId: { exact: deviceId } };
            } else if (facing) {
                constraints.video = { facingMode: facing };
            }
            return navigator.mediaDevices.getUserMedia(constraints).then(function (s) {
                stream = s;
                video.srcObject = stream;
                videoPlaceholder.style.display = 'none';
                return populateDevices();
            });
        }

        function stopStream() {
            if (stream) {
                stream.getTracks().forEach(function (t) { t.stop(); });
                stream = null;
            }
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                try { mediaRecorder.stop(); } catch (e) { }
            }
            video.srcObject = null;
            videoPlaceholder.style.display = '';
        }

        function pickMimeType() {
            var candidates = [
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=vp8,opus',
                'video/webm;codecs=vp9',
                'video/webm;codecs=vp8',
                'video/webm'
            ];
            for (var i = 0; i < candidates.length; i++) {
                if (window.MediaRecorder && MediaRecorder.isTypeSupported(candidates[i])) {
                    return candidates[i];
                }
            }
            return '';
        }

        btnStart.addEventListener('click', function () {
            clearMsg();
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                showMsg('error', '当前浏览器不支持摄像头访问 (getUserMedia)');
                return;
            }
            setStatus('', '正在请求摄像头权限…');
            startStream(null, facingMode)
                .then(function () {
                    btnStart.disabled = true;
                    btnStopCam.disabled = false;
                    btnRecord.disabled = false;
                    setStatus('live', '摄像头已启动');
                    showMsg('success', '摄像头已启动,可以开始录制');
                })
                .catch(function (err) {
                    handleCameraError(err);
                });
        });

        btnStopCam.addEventListener('click', function () {
            stopStream();
            btnStart.disabled = false;
            btnStopCam.disabled = true;
            btnSwitch.disabled = true;
            btnRecord.disabled = true;
            btnStopRecord.disabled = true;
            recIndicator.classList.remove('active');
            resetDuration();
            cameraSelect.disabled = true;
            cameraSelect.innerHTML = '';
            var opt = Tools.el('option', { value: '', text: '启动摄像头后显示可用设备' });
            cameraSelect.appendChild(opt);
            setStatus('', '摄像头已关闭');
        });

        btnSwitch.addEventListener('click', function () {
            if (!stream) return;
            facingMode = (facingMode === 'user') ? 'environment' : 'user';
            stopStream();
            setStatus('', '正在切换摄像头…');
            startStream(null, facingMode)
                .then(function () {
                    setStatus('live', '摄像头已切换');
                })
                .catch(function (err) {
                    handleCameraError(err);
                });
        });

        cameraSelect.addEventListener('change', function () {
            var deviceId = cameraSelect.value;
            if (!deviceId) return;
            stopStream();
            setStatus('', '正在切换摄像头…');
            startStream(deviceId, null)
                .then(function () {
                    setStatus('live', '已切换到 ' + (cameraSelect.options[cameraSelect.selectedIndex].text));
                })
                .catch(function (err) {
                    handleCameraError(err);
                });
        });

        btnRecord.addEventListener('click', function () {
            if (!stream) { showMsg('warn', '请先启动摄像头'); return; }
            if (!window.MediaRecorder) {
                showMsg('error', '当前浏览器不支持视频录制 (MediaRecorder)');
                return;
            }
            clearMsg();
            chunks = [];
            var options = { mimeType: pickMimeType() };
            try {
                mediaRecorder = options.mimeType ? new MediaRecorder(stream, options) : new MediaRecorder(stream);
            } catch (e) {
                showMsg('error', '创建录制器失败: ' + e.message);
                return;
            }
            mediaRecorder.ondataavailable = function (e) {
                if (e.data && e.data.size > 0) chunks.push(e.data);
            };
            mediaRecorder.onstop = function () {
                var mimeType = mediaRecorder.mimeType || 'video/webm';
                recordedBlob = new Blob(chunks, { type: mimeType });
                if (recordedUrl) URL.revokeObjectURL(recordedUrl);
                recordedUrl = URL.createObjectURL(recordedBlob);
                showPlayback(recordedUrl);
                btnDownload.disabled = false;
                if (lastRecordingDuration) {
                    recordingInfo.textContent = '时长 ' + lastRecordingDuration + ' · 大小 ' + formatBytes(recordedBlob.size);
                    lastRecordingDuration = '';
                }
            };
            mediaRecorder.start();
            recIndicator.classList.add('active');
            btnRecord.disabled = true;
            btnStopRecord.disabled = false;
            btnStart.disabled = true;
            btnStopCam.disabled = true;
            btnSwitch.disabled = true;
            cameraSelect.disabled = true;
            setStatus('recording', '正在录制…');
            startDurationTimer();
        });

        btnStopRecord.addEventListener('click', function () {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                lastRecordingDuration = recordStartTime ? fmtTime(Date.now() - recordStartTime) : '';
                mediaRecorder.stop();
            }
            recIndicator.classList.remove('active');
            btnRecord.disabled = false;
            btnStopRecord.disabled = true;
            btnStopCam.disabled = false;
            btnSwitch.disabled = false;
            cameraSelect.disabled = false;
            setStatus('live', '录制完成');
            stopDurationTimer();
            resetDurationDisplayOnly();
        });

        function resetDurationDisplayOnly() {
            if (durationTimer) { clearInterval(durationTimer); durationTimer = null; }
            durationText.style.display = 'none';
        }

        btnDownload.addEventListener('click', function () {
            if (!recordedBlob) { showMsg('warn', '暂无可下载的录制内容'); return; }
            var filename = 'recording-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.webm';
            Tools.download(filename, recordedBlob, recordedBlob.type || 'video/webm');
        });

        function showPlayback(url) {
            playbackWrap.innerHTML = '';
            var v = Tools.el('video', { controls: true, autoplay: true, playsinline: true });
            v.src = url;
            v.className = 'playback';
            playbackWrap.appendChild(v);
        }

        function handleCameraError(err) {
            var name = err && err.name ? err.name : '';
            var msg;
            if (name === 'NotAllowedError' || name === 'SecurityError') {
                msg = '摄像头权限被拒绝,请在浏览器设置中允许访问摄像头后重试';
            } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
                msg = '未检测到摄像头设备';
            } else if (name === 'NotReadableError' || name === 'TrackStartError') {
                msg = '摄像头被其他程序占用,请关闭后重试';
            } else if (name === 'OverconstrainedError') {
                msg = '未找到满足条件的摄像头,尝试切换其他设备';
            } else if (name === 'NotSupportedError') {
                msg = '当前环境不支持摄像头访问 (需要 HTTPS 或 localhost)';
            } else {
                msg = '启动摄像头失败: ' + (err && err.message ? err.message : '未知错误');
            }
            showMsg('error', msg);
            setStatus('error', '摄像头启动失败');
            btnStart.disabled = false;
            btnStopCam.disabled = true;
            btnRecord.disabled = true;
            videoPlaceholder.style.display = '';
        }

        function formatBytes(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
        }

        // 页面卸载时清理资源
        window.addEventListener('beforeunload', function () {
            if (stream) stopStream();
            if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        });
    });
})();
