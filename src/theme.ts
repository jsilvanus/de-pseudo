import { createTheme } from '@mui/material/styles';

/** A warm, paper-and-ember palette: terracotta primary, amber secondary, warm cream ground. */
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#C1540C', light: '#E0793D', dark: '#8F3D08', contrastText: '#FFF8F0' },
    secondary: { main: '#C08A2E', light: '#D9A441', dark: '#8C631E', contrastText: '#2E2119' },
    background: { default: '#FBF3EA', paper: '#FFFDF9' },
    text: { primary: '#2E2119', secondary: '#7A6552' },
    divider: '#E8D9C8',
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Nunito Sans", "Roboto", "Helvetica", "Arial", sans-serif',
    h3: { fontFamily: '"Fraunces", Georgia, serif', fontWeight: 600 },
    h5: { fontFamily: '"Fraunces", Georgia, serif', fontWeight: 600 },
    h6: { fontFamily: '"Fraunces", Georgia, serif', fontWeight: 600 },
  },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiAppBar: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
  },
});
