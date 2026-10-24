import { AudioClip, AudioSource, Component, Node, Pool, resources, _decorator } from "cc";
import { ISoundService } from "./ISoundService";
import { Log } from "../Log";
import { SoundBus } from "./SoundBus";
import { Sound } from "./Sound";
const { ccclass, property } = _decorator;

@ccclass('SoundManager')
export class SoundManager extends Component implements ISoundService {
    public static readonly SfxPoolSize: number = 8;
    public static readonly MaxCacheSize: number = 50;
    // public static readonly MuteFadeSeconds: number = 4;

    private _bgmSource: AudioSource;
    private _sfxSources: Pool<AudioSource>;
    private _ambientSource: AudioSource;
    private readonly _cache: Map<string, AudioClip> = new Map();
    private readonly _cacheOrder: string[] = [];
    private readonly _volumePercent: number[] = [100, 100, 100, 100];
    private _muteFlag: number = 0;
    private readonly _loadingClips =
        new Map<string, Promise<AudioClip | null>>();
    private readonly _playRequests = new Map<AudioSource, number>();
    private readonly _activeSfx = new Set<AudioSource>();

    onLoad() {
        this._bgmSource = this._createSource("BGM");
        this._ambientSource = this._createSource("Ambient");
        this._sfxSources = new Pool(() => {
            return this._createSource("Sfx");
        }, SoundManager.SfxPoolSize);
    }

    PlayBgm(resourcePath: string): void {
        void this._playOn(this._bgmSource, resourcePath);
    }

    async PlaySfx(resourcePath: string): Promise<void> {
        if (!resourcePath) {
            Log.error("SoundManager.PlaySfx: resourcePath is empty", "Sound");
            return;
        }

        let clip = await this._tryLoadClip(resourcePath);

        if (!this.isValid) {
            Log.error("SoundManager.PlaySfx: SoundManager is not valid", "Sound");
            return;
        }

        if (!clip) {
            Log.error(`SoundManager.PlaySfx: failed to load clip from ${resourcePath}`, "Sound");
            return;
        }

        let source = this._sfxSources.alloc();
        if (!source) {
            Log.error("SoundManager.PlaySfx: no available SFX source", "Sound");
            return;
        }
        source.clip = clip;
        source.loop = false;

        this._activeSfx.add(source);

        source.node.once(AudioSource.EventType.ENDED, () => {
            source.clip = null;
            this._activeSfx.delete(source);
            this._sfxSources.free(source);
        });

        source.volume = this._getEffectiveVolume(SoundBus.SFX);
        Log.info(`SoundManager.PlaySfx: playing ${resourcePath}`, "Sound");
        source.play();
    }

    StopBgm(): void {
        this._nextPlayRequest(this._bgmSource);
        this._bgmSource.stop();
    }

    PlayAmbient(resourcePath: string): void {
        void this._playOn(this._ambientSource, resourcePath);
    }

    StopAmbient(): void {
        this._nextPlayRequest(this._ambientSource);
        this._ambientSource.stop();
    }

    SetBusVolumePercent(busIndex: number, volume: number): void {
        if (!Number.isInteger(busIndex) || busIndex < 0 || busIndex >= SoundBus.Count) {
            Log.warn(`非法总线索引：${busIndex}`, "Sound");
            return;
        }

        if (!Number.isFinite(volume)) {
            Log.warn(`非法音量：${volume}`, "Sound");
            return;
        }

        this._volumePercent[busIndex] = Math.max(0, Math.min(100, volume));

        this._applyVolumes();
    }

    GetBusVolumePercent(busIndex: number): number {
        if (!Number.isInteger(busIndex) || busIndex < 0 || busIndex >= SoundBus.Count) {
            Log.warn(`非法总线索引：${busIndex}`, "Sound");
            return 100;
        }

        return this._volumePercent[busIndex];
    }

    SetMuteFlag(muteFlag: number): void {
        // let flip = this._muteFlag ^ muteFlag;
        this._muteFlag = muteFlag;

        this._applyVolumes();
    }

    GetMuteFlag(): number {
        return this._muteFlag;
    }

    ClearCache(): void {
        this._cache.clear();
        this._cacheOrder.length = 0;
    }

    private _createSource(name: string): AudioSource {
        const sourceNode = new Node(name);
        this.node.addChild(sourceNode);

        const source = sourceNode.addComponent(AudioSource);
        source.playOnAwake = false;
        source.loop = false;
        return source;
    }

    private async _playOn(source: AudioSource, resourcePath: string): Promise<void> {
        if (!resourcePath) {
            Log.warn("音频路径为空", "Sound");
            return;
        }

        const request = this._nextPlayRequest(source);
        const clip = await this._tryLoadClip(resourcePath);
        if (!clip || !source.isValid) {
            Log.warn("音频加载失败", "Sound");
            return;
        }

        // 加载期间又发生了播放或停止请求，本次结果已经过期。
        if (this._playRequests.get(source) !== request) {
            return;
        }

        source.clip = clip;
        const busIndex = source === this._bgmSource
            ? SoundBus.BGM
            : SoundBus.Ambient;

        source.volume = this._getEffectiveVolume(busIndex);
        Log.info(`SoundManager._playOn: playing ${resourcePath}`, "Sound");
        source.play();
    }

    private async _tryLoadClip(resourcePath: string): Promise<AudioClip | null> {
        if (!this.isValid) {
            return null;
        }

        const cache = this._cache.get(resourcePath);
        if (cache) {
            this._cacheOrder.splice(this._cacheOrder.indexOf(resourcePath), 1);
            this._cacheOrder.push(resourcePath);
            return cache;
        }

        // 已经有人在加载，直接等待同一个任务。
        const loading = this._loadingClips.get(resourcePath);
        if (loading) {
            return loading;
        }

        const task = new Promise<AudioClip | null>(resolve => {
            resources.load<AudioClip>(resourcePath, (err, clip) => {
                if (err) {
                    Log.warn("音频加载失败：" + err.message, "Sound");
                    resolve(null);
                    return;
                }

                if (this._cache.size >= SoundManager.MaxCacheSize && this._cacheOrder[0] != null) {
                    let oldest = this._cacheOrder.shift();
                    this._cache.delete(oldest);
                }

                if (!this.isValid) {
                    resolve(null);
                    return;
                }

                this._cache.set(resourcePath, clip);
                this._cacheOrder.push(resourcePath);
                resolve(clip);
            });
        });

        this._loadingClips.set(resourcePath, task);
        try {
            return await task;
        } finally {
            this._loadingClips.delete(resourcePath);
        }
    }

    private _isMuted(busIndex: number): boolean {
        return (this._muteFlag & (1 << busIndex)) !== 0;
    }

    private _nextPlayRequest(source: AudioSource): number {
        const request = (this._playRequests.get(source) ?? 0) + 1;
        this._playRequests.set(source, request);
        return request;
    }

    private _getEffectiveVolume(busIndex: number): number {
        if (this._isMuted(SoundBus.Master) || this._isMuted(busIndex)) {
            return 0;
        }
        return (
            this._volumePercent[SoundBus.Master] / 100 *
            this._volumePercent[busIndex] / 100
        );
    }

    private _applyVolumes(): void {
        this._bgmSource.volume =
            this._getEffectiveVolume(SoundBus.BGM);

        this._ambientSource.volume =
            this._getEffectiveVolume(SoundBus.Ambient);

        const sfxVolume = this._getEffectiveVolume(SoundBus.SFX);
        for (const source of this._activeSfx) {
            source.volume = sfxVolume;
        }
    }

    onDestroy(): void {
        Sound.Reset(this);

        this._activeSfx.clear();
        this._playRequests.clear();
        this._loadingClips.clear();
        this._cache.clear();
        this._cacheOrder.length = 0;

        this._sfxSources?.destroy();
    }

}