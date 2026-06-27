# Multi-Agent Consistency in StreamClip

## Architecture Overview

StreamClip is designed as a modular pipeline that supports multiple AI agents through a unified interface. The core design ensures:

### 1. **Provider-agnostic API Layer**
- All agents (STT and LLM) expose a common interface via environment variables:
  - `STT_API_KEY`, `STT_BASE_URL`, `STT_MODEL`
  - `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`

### 2. **Dynamic Provider Detection**
The application detects the active provider based on:
- `base_url` configuration
- Provider-specific presets (Groq, OpenAI, AssemblyAI, etc.)
- Environment variables

### 3. **Consistent Processing Pipeline**
The workflow remains identical regardless of the agent:
1. **Audio Preparation** (same chunking logic)
2. **Transcription** (agent-specific implementation)
3. **Analysis** (LLM processing)
4. **Rendering** (same video processing)

## How Consistency is Maintained

### Configuration Management
- **Settings Panel**: Provides a unified UI for all providers
- **Preset System**: Default configurations for each provider
- **Environment Variables**: Centralized key storage

### Processing Consistency
- **Chunking**: Same audio processing regardless of provider
- **Time Range Handling**: Consistent filtering logic
- **Output Generation**: Identical clip creation workflow

### Error Handling
- **Standardized Error Messages**: Uniform error reporting
- **Progress Tracking**: Consistent UI feedback
- **Retry Logic**: Same retry mechanisms for all providers

## Agent-Specific Implementations

### Speech-to-Text (STT) Providers
| Provider | Implementation | Key Features |
|----------|----------------|--------------|
| Groq     | OpenAI SDK     | Fast API, 10min chunks |
| OpenAI   | OpenAI SDK     | Standard Whisper models |
| AssemblyAI | Custom API | 5GB file support, native upload |
| Custom   | OpenAI-compatible | User-defined endpoints |

### Language Model (LLM) Providers
| Provider | Implementation | Key Features |
|----------|----------------|--------------|
| Groq     | OpenAI SDK     | Fast inference |
| OpenAI   | OpenAI SDK     | Standard models |
| OpenRouter | Custom API | Model marketplace |
| Ollama   | Local inference | Offline support |
| Custom   | OpenAI-compatible | User-defined endpoints |

## Migration Guide

### Changing Providers
1. **Update Settings**:
   - Select new provider from UI
   - Enter API key and model
2. **Restart Application**:
   - The pipeline automatically switches to new provider
3. **Verify Consistency**:
   - Check output quality and timing
   - Review error handling

### Maintaining Consistency
- **Configuration Validation**: All providers validate inputs
- **Progress Tracking**: Same UI regardless of provider
- **Error Reporting**: Standardized error messages
- **Performance Metrics**: Consistent timing across providers

## Best Practices

1. **Provider Selection**:
   - Choose based on file size and API limits
   - AssemblyAI for large files (>1GB)
   - Groq/OpenAI for standard use cases

2. **API Key Management**:
   - Store keys securely in environment variables
   - Use environment variables over hardcoding
   - Rotate keys regularly

3. **Performance Optimization**:
   - Adjust chunk size based on provider limits
   - Monitor API rate limits
   - Implement retry logic

4. **Testing**:
   - Test each provider with sample files
   - Verify output quality
   - Check for API compatibility issues

## Conclusion

StreamClip's multi-agent architecture provides flexibility while maintaining a consistent user experience. The unified interface and standardized processing pipeline ensure that switching between providers is seamless, with only the underlying implementation changing while the user workflow remains identical. This approach allows users to leverage the best tools available without changing their workflow.