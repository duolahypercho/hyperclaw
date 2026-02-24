import React from "react";
import { useMusicTool } from "./Provider/musicProvider";
import { InteractApp } from "@OS/InteractApp";
import { InteractContent } from "@OS/Provider/InteractContentProv";
import MusicHome from "./components/Home";
import MusicCreate from "./components/Music/MusicCreate";
import MusicLibrary from "./components/Library";
import MusicPlaylist from "./components/PlayList";

const Index = () => {
  const { appSchema, playlists } = useMusicTool();

  return (
    <>
      <InteractApp appSchema={appSchema} className="p-3">
        {/* Home tab - preserve state to keep images loaded */}
        <InteractContent value="music-home">
          <MusicHome />
        </InteractContent>

        {/* Other tabs - use lazy loading for better initial performance */}
        <InteractContent value="music-create" lazy>
          <MusicCreate />
        </InteractContent>
        <InteractContent value="music-library" lazy>
          <MusicLibrary />
        </InteractContent>

        {/* Playlist tabs - lazy load since they're dynamic */}
        {playlists.map((playlist) => (
          <InteractContent
            key={playlist._id}
            value={`playlist:${playlist._id}`}
            lazy
          >
            <MusicPlaylist />
          </InteractContent>
        ))}
      </InteractApp>
    </>
  );
};

export default Index;
