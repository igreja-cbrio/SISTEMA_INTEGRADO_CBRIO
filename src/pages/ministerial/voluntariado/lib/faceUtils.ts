/**
 * Utility functions for face recognition
 */

/**
 * Calculate the average of multiple face descriptors.
 * This improves recognition accuracy by combining multiple angles.
 */
export function averageDescriptors(descriptors: Float32Array[]): Float32Array {
  if (descriptors.length === 0) {
    throw new Error('Nenhum descritor para calcular media');
  }
  if (descriptors.length === 1) {
    return descriptors[0];
  }

  const result = new Float32Array(128);

  for (let i = 0; i < 128; i++) {
    let sum = 0;
    for (const descriptor of descriptors) {
      sum += descriptor[i];
    }
    result[i] = sum / descriptors.length;
  }

  // Normalize the vector
  const magnitude = Math.sqrt(result.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < 128; i++) {
      result[i] /= magnitude;
    }
  }

  return result;
}
