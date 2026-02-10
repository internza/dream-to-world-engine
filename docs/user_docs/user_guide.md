# User Guide

## Purpose

The Dream to World Engine converts a dream description into a structured world model. The output is intended to be readable by both people and programs.

## Basic Workflow

1. Provide dream input
2. Run the engine
3. Review the generated world model output

## Running the Engine

From the repository root:
npm start

## Input

Current version behavior:
1. Dream input is provided by a hardcoded string in the source code.
2. The system processes the text deterministically.

If you want to test different dreams, replace the hardcoded dream string and run again.

## Output

The engine prints JSON that contains entities with attributes.

Common fields you may see:
1. id
2. type
3. attributes

## Practical Use

You can use the JSON output as:
1. A structured intermediate representation for later stages
2. Test data for future UI or visualization work
3. A baseline for evaluating improvements across iterations
