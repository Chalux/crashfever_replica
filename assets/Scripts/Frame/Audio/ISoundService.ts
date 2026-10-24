export interface ISoundService {
    PlayBgm(resourcePath: string): void;
    PlaySfx(resourcePath: string): void;
    StopBgm(): void;
    PlayAmbient(resourcePath: string): void;
    StopAmbient(): void;
    SetBusVolumePercent(busIndex: number, volume: number): void;
    GetBusVolumePercent(busIndex: number): number;
    SetMuteFlag(muteFlag: number): void;
    GetMuteFlag(): number;

    ClearCache(): void;
}
