/** Output destinations. Combine flags with |; add future channels using unused bits. */
export enum LogChannel {
    None = 0,
    Console = 1 << 0,
}
