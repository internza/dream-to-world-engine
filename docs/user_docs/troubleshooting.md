# Troubleshooting

## npm start fails

1. Install dependencies again
2. Try running again
  
## Node version issues

Check version:
node -v


If it is below 18, install a newer version of Node.js.

## No output appears

1. Confirm you are in the repository root folder
2. Confirm package.json has a start script
3. Confirm the main entry file prints output

## Output looks wrong after edits

If you changed source code, revert your recent changes and run again to confirm the baseline still works.
