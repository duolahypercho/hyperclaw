import { AudioType } from "./MusicPlayer/types";
import { ZSong } from "./Provider/types";

export const getAudioDisplayInfo = ({currentAudio, currentSong}: {currentAudio: AudioType | null, currentSong: ZSong | null}) => {
    if (!currentAudio) {
        return {
            title: currentSong?.title || "Song Title",
            description: currentSong?.artist
                ? currentSong.artist.join(", ")
                : "Artist",
            type: "music",
        };
    }

    return {
        title: currentAudio.title,
        description: currentAudio.description,
        type: currentAudio.type,
    };
};