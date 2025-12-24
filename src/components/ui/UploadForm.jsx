import { useAudio } from '../../contexts/AudioContext'

function UploadForm({ onFileSelect }) {
  const {
    uploadTitle,
    uploadArtist,
    uploadYoutubeUrl,
    uploadLoading,
    uploadError,
    setUploadTitle,
    setUploadArtist,
    setUploadYoutubeUrl,
    fileInputRef,
  } = useAudio()

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      onFileSelect(file)
    }
  }

  return (
    <div className="action-card upload">
      <h3>Subir Nueva Cancion</h3>
      <div className="action-form">
        <input
          type="text"
          placeholder="Titulo"
          value={uploadTitle}
          onChange={(e) => setUploadTitle(e.target.value)}
          className="action-input"
          disabled={uploadLoading}
        />
        <input
          type="text"
          placeholder="Artista"
          value={uploadArtist}
          onChange={(e) => setUploadArtist(e.target.value)}
          className="action-input"
          disabled={uploadLoading}
        />
        <input
          type="text"
          placeholder="URL YouTube (opcional)"
          value={uploadYoutubeUrl}
          onChange={(e) => setUploadYoutubeUrl(e.target.value)}
          className="action-input youtube"
          disabled={uploadLoading}
        />
        <input
          type="file"
          ref={fileInputRef}
          accept=".mp3,audio/mpeg"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <button
          className="action-btn primary"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadLoading}
        >
          {uploadLoading ? 'Subiendo...' : 'Seleccionar MP3'}
        </button>
        <p className="action-hint">El audio sera analizado automaticamente</p>
        {uploadError && <p className="error-msg">{uploadError}</p>}
      </div>
    </div>
  )
}

export default UploadForm
