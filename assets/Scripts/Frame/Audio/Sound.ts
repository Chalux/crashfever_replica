import { ISoundService } from "./ISoundService";
import { SoundBus } from "./SoundBus";

export class Sound {
    private static Implementation: ISoundService | null = null;

    static Configure(service: ISoundService): void {
        this.Implementation = service;
    }

    static Reset(service: ISoundService): void {
        // 避免旧组件销毁时清除后来注册的新组件。
        if (this.Implementation === service) {
            this.Implementation = null;
        }
    }

    static PlaySfx(resourcePath: string): void {
        this.Implementation?.PlaySfx(resourcePath);
    }

    static PlayBgm(resourcePath: string): void {
        this.Implementation?.PlayBgm(resourcePath);
    }

    static GetBusVolumePercent(bus: SoundBus): number {
        return this.Implementation?.GetBusVolumePercent(bus) ?? 0;
    }

    static SetBusVolumePercent(bus: SoundBus, value: number): void {
        this.Implementation?.SetBusVolumePercent(bus, value);
    }

    static GetBusMute(bus: SoundBus): boolean {
        return ((this.Implementation?.GetMuteFlag() ?? 0) & (1 << bus)) !== 0;
    }

    static SetBusMute(bus: SoundBus, value: boolean): void {
        const muteFlag = this.Implementation?.GetMuteFlag() ?? 0;
        if (value) {
            this.Implementation?.SetMuteFlag(muteFlag | (1 << bus));
        } else {
            this.Implementation?.SetMuteFlag(muteFlag & ~(1 << bus));
        }
    }
}
