# User Manual

## Intended Audience

This project is intended for users comfortable running a Node.js project from a terminal.

## Operating Modes

Current supported mode:
1. Run from terminal using npm start

Planned future modes may include:
1. Command line arguments for dream input
2. File input
3. Web interface

## Detailed Behavior

1. Reads a dream input string from the codebase
2. Extracts concepts and generates entities
3. Outputs a world model as JSON to the console

## Determinism

Given the same input, the output should remain the same. This is useful for testing and iteration comparisons.

## Limitations

1. No interactive prompt input in the current version
2. No persistent storage in the current version
3. Output is console based JSON only

## Known Constraints

1. The system is a prototype intended for academic use
2. The model focuses on creating a baseline world representation, not full natural language understanding
