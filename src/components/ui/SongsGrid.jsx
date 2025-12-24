import SongCard from './SongCard'

function SongsGrid({ songs, onSelectSong }) {
  return (
    <div className="songs-section">
      <h2 className="section-title">Canciones Disponibles</h2>
      <div className="songs-grid">
        {songs.map(song => (
          <SongCard
            key={song.id}
            song={song}
            onClick={onSelectSong}
          />
        ))}
      </div>
    </div>
  )
}

export default SongsGrid
